export type StructValue =
  | { nullValue: 0 | "NULL_VALUE" }
  | { boolValue: boolean }
  | { numberValue: number }
  | { stringValue: string }
  | { listValue: { values: StructValue[] } }
  | { structValue: Struct };

export type StructFields = Record<string, StructValue>;

export interface Struct {
  fields: StructFields;
}

export function toStruct(obj: Record<string, unknown>): Struct {
  return { fields: toStructFields(obj) };
}

export function toStructFields(obj: Record<string, unknown>): StructFields {
  const fields: StructFields = {};
  for (const [key, value] of Object.entries(obj)) {
    fields[key] = toStructValue(value);
  }
  return fields;
}

export function toStructValue(value: unknown): StructValue {
  if (value === null || value === undefined) {
    return { nullValue: 0 };
  }
  if (typeof value === "boolean") {
    return { boolValue: value };
  }
  if (typeof value === "number") {
    return { numberValue: value };
  }
  if (typeof value === "string") {
    return { stringValue: value };
  }
  if (Array.isArray(value)) {
    return { listValue: { values: value.map(toStructValue) } };
  }
  if (typeof value === "object") {
    return { structValue: { fields: toStructFields(value as Record<string, unknown>) } };
  }
  return { stringValue: String(value) };
}

export function decodeStructLike(payload: unknown): Record<string, unknown> {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if ("fields" in record && record.fields && typeof record.fields === "object") {
      return fromStruct(record as { fields: Record<string, unknown> });
    }
    return record;
  }
  return {};
}

export function fromStruct(struct: { fields: Record<string, unknown> }): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(struct.fields)) {
    result[key] = fromStructValue(value);
  }
  return result;
}

export function fromStructValue(value: unknown): unknown {
  if (!value || typeof value !== "object") {
    return value;
  }
  const record = value as Record<string, unknown>;
  if ("stringValue" in record) return record.stringValue as string;
  if ("numberValue" in record) return record.numberValue as number;
  if ("boolValue" in record) return record.boolValue as boolean;
  if ("listValue" in record && record.listValue && typeof record.listValue === "object") {
    const list = record.listValue as { values?: unknown[] };
    return (list.values ?? []).map(fromStructValue);
  }
  if ("structValue" in record && record.structValue && typeof record.structValue === "object") {
    const struct = record.structValue as { fields: Record<string, unknown> };
    return fromStruct(struct);
  }
  if ("nullValue" in record) return null;
  return value;
}
