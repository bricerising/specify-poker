import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import * as path from "path";

import { config } from "../../config";

const BALANCE_PROTO_PATH = path.resolve(__dirname, "../../../../balance/proto/balance.proto");
const EVENT_PROTO_PATH = path.resolve(__dirname, "../../../../event/proto/event.proto");

function loadProto(protoPath: string) {
  const packageDefinition = protoLoader.loadSync(protoPath, {
    keepCase: true,
    longs: Number,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  return grpc.loadPackageDefinition(packageDefinition);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const balanceProto = loadProto(BALANCE_PROTO_PATH) as any;
const eventProto = loadProto(EVENT_PROTO_PATH) as any;

export const balanceClient = new balanceProto.balance.BalanceService(
  config.balanceServiceAddr,
  grpc.credentials.createInsecure()
) as any;

export const eventClient = new eventProto.event.EventService(
  config.eventServiceAddr,
  grpc.credentials.createInsecure()
) as any;
