/** EVA's region API accepts at most 10,000 records per page. */
export function validateRegionPaging(params: Record<string, unknown> = {}): void {
  const { limit, skip } = params;
  if (limit !== undefined && (!Number.isSafeInteger(limit) || Number(limit) < 1 || Number(limit) > 10000)) {
    throw Object.assign(new Error("limit must be an integer from 1 to 10000"), { status: 400 });
  }
  if (skip !== undefined && (!Number.isSafeInteger(skip) || Number(skip) < 0)) {
    throw Object.assign(new Error("skip must be a nonnegative safe integer"), { status: 400 });
  }
}
