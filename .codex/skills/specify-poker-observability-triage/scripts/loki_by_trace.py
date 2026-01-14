#!/usr/bin/env python3
import argparse
import datetime as dt
import json
import sys
import time
import urllib.parse
import urllib.request


def _ns(ts_seconds: float) -> int:
    return int(ts_seconds * 1_000_000_000)


def _iso_from_ns(ns: str) -> str:
    seconds = int(ns) / 1_000_000_000
    return dt.datetime.fromtimestamp(seconds, tz=dt.timezone.utc).isoformat()


def main() -> int:
    parser = argparse.ArgumentParser(
        prog="loki_by_trace.py",
        description="Query Loki for logs matching a given OpenTelemetry traceId.",
    )
    parser.add_argument("trace_id", help="OpenTelemetry traceId (hex string)")
    parser.add_argument(
        "--loki",
        default="http://localhost:3100",
        help="Loki base URL (default: http://localhost:3100)",
    )
    parser.add_argument(
        "--minutes",
        type=int,
        default=15,
        help="Lookback window in minutes (default: 15)",
    )
    parser.add_argument(
        "--service-re",
        default="gateway|game|balance|player|event|notify",
        help='Regex for the docker compose "service" label (default: gateway|game|balance|player|event|notify)',
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=200,
        help="Max log lines to return (default: 200)",
    )
    parser.add_argument(
        "--direction",
        choices=["forward", "backward"],
        default="forward",
        help="Result sort direction (default: forward)",
    )
    args = parser.parse_args()

    end_ns = _ns(time.time())
    start_ns = _ns(time.time() - (args.minutes * 60))

    query = f'{{service=~"{args.service_re}"}} | json | traceId="{args.trace_id}"'

    base = args.loki.rstrip("/") + "/"
    url = urllib.parse.urljoin(base, "loki/api/v1/query_range")
    url = url + "?" + urllib.parse.urlencode(
        {
            "query": query,
            "start": str(start_ns),
            "end": str(end_ns),
            "limit": str(args.limit),
            "direction": args.direction,
        }
    )

    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except Exception as exc:
        print(f"Failed to query Loki: {exc}", file=sys.stderr)
        print(f"URL: {url}", file=sys.stderr)
        return 2

    if payload.get("status") != "success":
        print("Loki returned non-success response", file=sys.stderr)
        print(json.dumps(payload, indent=2), file=sys.stderr)
        return 3

    results = payload.get("data", {}).get("result", [])
    if not results:
        print(
            f"No matches for traceId={args.trace_id} in last {args.minutes}m (service=~{args.service_re}).",
            file=sys.stderr,
        )
        return 1

    for stream in results:
        labels = stream.get("stream", {})
        service = labels.get("service", "?")
        container = labels.get("container", "")
        header = f"{service}" + (f" ({container})" if container else "")

        for ts_ns, line in stream.get("values", []):
            ts_iso = _iso_from_ns(ts_ns)
            print(f"{ts_iso} {header} {line}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

