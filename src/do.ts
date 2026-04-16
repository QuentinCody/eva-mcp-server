import { RestStagingDO } from "@bio-mcp/shared/staging/rest-staging-do";
import type { SchemaHints } from "@bio-mcp/shared/staging/schema-inference";

export class EvaDataDO extends RestStagingDO {
    protected getSchemaHints(data: unknown): SchemaHints | undefined {
        if (!data || typeof data !== "object") return undefined;

        // EVA responses commonly wrap payload in response[].result[]
        if (Array.isArray(data)) {
            const sample = data[0];
            if (sample && typeof sample === "object") {
                if ("ids" in sample || "mainId" in sample || "chromosome" in sample) {
                    return {
                        tableName: "variants",
                        indexes: ["chromosome", "start", "mainId"],
                    };
                }
                if ("taxonomyCode" in sample || "taxonomyId" in sample || "assemblyCode" in sample) {
                    return {
                        tableName: "species",
                        indexes: ["taxonomyCode", "taxonomyId", "assemblyCode"],
                    };
                }
                if ("studyId" in sample || "studyName" in sample) {
                    return {
                        tableName: "studies",
                        indexes: ["studyId", "studyName"],
                    };
                }
            }
        }

        return undefined;
    }
}
