import type { FastifyInstance } from "fastify";

export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "CommonGroundChecker API",
    version: "1.0.0",
    description:
      "Machine-readable API description for repository metadata, analysis results, and scoring configuration.",
  },
  servers: [
    {
      url: "http://localhost:3000",
      description: "Local development server",
    },
  ],
  paths: {
    "/api/openapi": {
      get: {
        summary: "Retrieve the OpenAPI specification",
        responses: {
          "200": {
            description: "OpenAPI document",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                },
              },
            },
          },
        },
      },
    },
    "/api/repositories": {
      get: {
        summary: "List known repositories with latest summary",
        parameters: [
          {
            name: "limit",
            in: "query",
            description: "Maximum number of repositories to return",
            required: false,
            schema: {
              type: "integer",
              minimum: 1,
              maximum: 50,
              default: 12,
            },
          },
        ],
        responses: {
          "200": {
            description: "Repository summary list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    repositories: {
                      type: "array",
                      items: { $ref: "#/components/schemas/RepoSummary" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        summary: "Create or update repository metadata",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/RepoMetadata" },
            },
          },
        },
        responses: {
          "200": {
            description: "Repository metadata saved",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/RepoSummary" },
              },
            },
          },
          "400": {
            description: "Invalid repository metadata",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/api/repositories/export": {
      get: {
        summary: "Export repository analysis history as CSV",
        responses: {
          "200": {
            description: "CSV export of repository analysis history",
            content: {
              "text/csv": {
                schema: { type: "string" },
              },
            },
          },
        },
      },
    },
    "/api/check": {
      post: {
        summary: "Run full analysis and persist result",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CheckRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "Analysis report",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CheckReport" },
              },
            },
          },
          "400": {
            description: "Invalid analysis request",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/api/check/stream": {
      post: {
        summary: "Stream progress events during analysis",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CheckRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "Analysis progress streamed as text/event-stream",
            content: {
              "text/event-stream": {
                schema: { type: "string" },
              },
            },
          },
          "400": {
            description: "Invalid analysis request",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/api/repositories/{repoId}/analyses": {
      post: {
        summary: "Create a new analysis result for an existing repository",
        parameters: [
          {
            name: "repoId",
            in: "path",
            required: true,
            schema: {
              type: "string",
            },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/RepoAnalysisInput" },
            },
          },
        },
        responses: {
          "201": {
            description: "Analysis result created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/RepoAnalysisOutput" },
              },
            },
          },
          "400": {
            description: "Invalid analysis payload",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "404": {
            description: "Repository not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/api/repo-history": {
      get: {
        summary: "Return analysis history for a repository",
        parameters: [
          {
            name: "owner",
            in: "query",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "repo",
            in: "query",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "limit",
            in: "query",
            required: false,
            schema: {
              type: "integer",
              minimum: 1,
              maximum: 200,
              default: 50,
            },
          },
        ],
        responses: {
          "200": {
            description: "Repository history",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/RepoHistoryResponse" },
              },
            },
          },
        },
      },
    },
    "/api/admin/scoring": {
      get: {
        summary: "Retrieve current scoring configuration",
        responses: {
          "200": {
            description: "Current scoring configuration",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ScoringConfigResponse" },
              },
            },
          },
        },
      },
      post: {
        summary: "Save scoring configuration snapshot",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  reset: { type: "boolean" },
                  criterionWeights: {
                    type: "object",
                    additionalProperties: { type: "number" },
                  },
                  criterionRequirementLevels: {
                    type: "object",
                    additionalProperties: {
                      type: "string",
                      enum: ["mandatory", "recommended"],
                    },
                  },
                  complexityThreshold: { type: "number" },
                  complexityMaxCcnThreshold: { type: "number" },
                  spectralRulesetSource: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Saved scoring configuration snapshot",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ScoringConfigResponse" },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      ErrorResponse: {
        type: "object",
        properties: {
          error: { type: "string" },
        },
        required: ["error"],
      },
      RepoSummary: {
        type: "object",
        properties: {
          id: { type: "string" },
          owner: { type: "string" },
          name: { type: "string" },
          repoUrl: { type: "string" },
          helmChartLocations: { type: "array", items: { type: "string" } },
          dockerLocations: { type: "array", items: { type: "string" } },
          apiSpecificationLocations: {
            type: "array",
            items: { type: "string" },
          },
          documentationLocations: {
            type: "array",
            items: { type: "string" },
          },
          updatedAt: { type: "string", format: "date-time" },
          analysisCount: { type: "integer" },
          latestAnalysis: {
            type: ["object", "null"],
            properties: {
              checkedAt: { type: "string", format: "date-time" },
              score: { type: "integer" },
            },
          },
        },
        required: [
          "id",
          "owner",
          "name",
          "repoUrl",
          "helmChartLocations",
          "dockerLocations",
          "apiSpecificationLocations",
          "documentationLocations",
          "updatedAt",
          "analysisCount",
          "latestAnalysis",
        ],
      },
      RepoMetadata: {
        type: "object",
        properties: {
          repoUrl: { type: "string" },
          description: { type: "string" },
          language: { type: "string" },
          stars: { type: "integer" },
          forks: { type: "integer" },
          defaultBranch: { type: "string" },
          topics: {
            type: "array",
            items: { type: "string" },
          },
          license: { type: "string" },
          version: { type: "string" },
          versionEvidenceSource: { type: "string" },
          versionEvidenceDetail: { type: "string" },
          helmChartLocations: {
            type: "array",
            items: { type: "string" },
          },
          dockerLocations: {
            type: "array",
            items: { type: "string" },
          },
          apiSpecificationLocations: {
            type: "array",
            items: { type: "string" },
          },
          documentationLocations: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["repoUrl"],
      },
      CheckRequest: {
        type: "object",
        properties: {
          repoUrl: { type: "string" },
          helmChartLocations: {
            type: "array",
            items: { type: "string" },
          },
          documentationLocations: {
            type: "array",
            items: { type: "string" },
          },
          dockerLocations: {
            type: "array",
            items: { type: "string" },
          },
          apiSpecificationLocations: {
            type: "array",
            items: { type: "string" },
          },
          isRegister: { type: "boolean" },
        },
        required: ["repoUrl"],
      },
      RepoAnalysisInput: {
        type: "object",
        properties: {
          scoringConfigId: { type: ["string", "null"] },
          checkedAt: { type: "string", format: "date-time" },
          version: { type: ["string", "null"] },
          score: { type: "integer" },
          results: {
            type: "array",
            items: { $ref: "#/components/schemas/CheckResult" },
          },
        },
        required: ["checkedAt", "score", "results"],
      },
      RepoAnalysisOutput: {
        type: "object",
        properties: {
          id: { type: "string" },
          repoId: { type: "string" },
          scoringConfigId: { type: ["string", "null"] },
          checkedAt: { type: "string", format: "date-time" },
          version: { type: ["string", "null"] },
          score: { type: "integer" },
          results: {
            type: "array",
            items: { $ref: "#/components/schemas/CheckResult" },
          },
          createdAt: { type: "string", format: "date-time" },
        },
        required: ["id", "repoId", "checkedAt", "score", "results", "createdAt"],
      },
      RepoHistoryResponse: {
        type: "object",
        properties: {
          repository: {
            type: "object",
            properties: {
              id: { type: "string" },
              repoUrl: { type: "string" },
              owner: { type: "string" },
              name: { type: "string" },
              metadata: { $ref: "#/components/schemas/RepoMeta" },
              createdAt: { type: "string", format: "date-time" },
              updatedAt: { type: "string", format: "date-time" },
            },
            required: [
              "id",
              "repoUrl",
              "owner",
              "name",
              "metadata",
              "createdAt",
              "updatedAt",
            ],
          },
          analyses: {
            type: "array",
            items: { $ref: "#/components/schemas/RepoAnalysisOutput" },
          },
        },
        required: ["repository", "analyses"],
      },
      ScoringConfigResponse: {
        type: "object",
        properties: {
          ok: { type: "boolean" },
          scoringConfigId: { type: ["string", "null"] },
          complexityThreshold: { type: "integer" },
          complexityMaxCcnThreshold: { type: "integer" },
          spectralRulesetSource: { type: "string" },
          criterionWeights: {
            type: "object",
            additionalProperties: { type: "number" },
          },
          criterionRequirementLevels: {
            type: "object",
            additionalProperties: {
              type: "string",
              enum: ["mandatory", "recommended"],
            },
          },
          defaultCriterionWeights: {
            type: "object",
            additionalProperties: { type: "number" },
          },
          defaultCriterionRequirementLevels: {
            type: "object",
            additionalProperties: {
              type: "string",
              enum: ["mandatory", "recommended", "informative"],
            },
          },
          defaultComplexityThreshold: { type: "integer" },
          defaultComplexityMaxCcnThreshold: { type: "integer" },
          defaultSpectralRulesetSource: { type: "string" },
        },
        required: [
          "scoringConfigId",
          "complexityThreshold",
          "complexityMaxCcnThreshold",
          "spectralRulesetSource",
          "criterionWeights",
          "criterionRequirementLevels",
          "defaultCriterionWeights",
          "defaultCriterionRequirementLevels",
          "defaultComplexityThreshold",
          "defaultComplexityMaxCcnThreshold",
          "defaultSpectralRulesetSource",
        ],
      },
      RepoMeta: {
        type: "object",
        properties: {
          description: { type: ["string", "null"] },
          language: { type: ["string", "null"] },
          stars: { type: "integer" },
          forks: { type: "integer" },
          defaultBranch: { type: "string" },
          topics: {
            type: "array",
            items: { type: "string" },
          },
          license: { type: ["string", "null"] },
          version: { type: ["string", "null"] },
          versionEvidence: {
            type: "object",
            properties: {
              source: {
                type: "string",
                enum: ["release", "tag", "manifest", "readme", "none"],
              },
              detail: { type: "string" },
            },
            required: ["source", "detail"],
          },
        },
        required: [
          "description",
          "language",
          "stars",
          "forks",
          "defaultBranch",
          "topics",
          "license",
          "version",
          "versionEvidence",
        ],
      },
      CheckResult: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          requirementLevel: {
            type: "string",
            enum: ["mandatory", "recommended", "informative"],
          },
          status: {
            type: "string",
            enum: ["pass", "fail", "warn", "info"],
          },
          message: { type: "string" },
          evidence: {
            type: "array",
            items: { type: "string" },
          },
          referenceUrl: { type: "string" },
          confidence: {
            type: "string",
            enum: ["high", "medium", "low"],
          },
        },
        required: ["id", "title", "description", "status", "message"],
      },
      CheckReport: {
        type: "object",
        properties: {
          repoUrl: { type: "string" },
          owner: { type: "string" },
          repo: { type: "string" },
          checkedAt: { type: "string", format: "date-time" },
          scoringConfigId: { type: ["string", "null"] },
          score: { type: "integer" },
          results: {
            type: "array",
            items: { $ref: "#/components/schemas/CheckResult" },
          },
          repoMeta: { $ref: "#/components/schemas/RepoMeta" },
        },
        required: ["repoUrl", "owner", "repo", "checkedAt", "score", "results", "repoMeta"],
      },
    },
  },
};

export async function registerOpenApiRoute(fastify: FastifyInstance) {
  fastify.get("/api/openapi", async () => openApiSpec);
}
