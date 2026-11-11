import { expect, it } from "vitest";
import { evaCompleteness } from "./completeness";

it("counts native occurrences across groups without treating the count-disabled zero as absence", () => {
  const page = { response: [{ numResults: 5, numTotalResults: 0, result: Array.from({ length: 5 }, () => ({ id: "same" })) }] };
  expect(evaCompleteness(page)).toMatchObject({ complete: false, returned: 5 });
  expect(evaCompleteness(page)?.total_available).toBeUndefined();
  expect(evaCompleteness({ response: [...page.response, ...page.response] })).toMatchObject({ complete: false, returned: 10 });
});

it("preserves meaningful single-group totals without asserting a stable complete dataset", () => {
  expect(evaCompleteness({ response: [{ numTotalResults: 315, result: [{}] }] })).toMatchObject({ complete: false, returned: 1, total_available: 315, truncation: { reason: "page_limit" } });
  expect(evaCompleteness({ response: [{ numTotalResults: 0, result: [] }] })).toMatchObject({ complete: false, returned: 0 });
});

it("keeps placements, history events and independently composed requests separate", () => {
  const variants = [{ accession: 1, data: { assembly: "A" } }, { accession: 1, data: { assembly: "B" } }];
  expect(evaCompleteness(variants)).toMatchObject({ complete: false, returned: 2 });
  expect(evaCompleteness({ variants, operations: [{ type: "MERGE" }] })).toMatchObject({ complete: false, returned: 2 });
  expect(evaCompleteness({ first: variants, second: { __staged: true, _staging: { completeness: { complete: false, returned: 5 } } } })).toEqual(expect.objectContaining({ complete: false }));
  expect(evaCompleteness({ first: variants, second: variants })?.returned).toBeUndefined();
});
