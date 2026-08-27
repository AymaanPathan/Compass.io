export interface TechConfidence {
  name: string;
  confidence: number;
}

export interface DeveloperProfile {
  builderArchetype: string;

  developerType: string;

  summary: string;

  githubVibe: string;

  experienceLevel:
    | "Beginner"
    | "Early Intermediate"
    | "Intermediate"
    | "Advanced";

  strongestTechnologies: TechConfidence[];

  strengths: string[];

  engineeringPatterns: string[];

  contributionAreas: string[];

  funInsights: string[];
}

// ---------------------------------------------------------------------------
// Repository recommendations
// ---------------------------------------------------------------------------

export interface MatchedRepository {
  name: string;

  url: string;

  description: string;

  repoType: string;

  whyItMatches: string;
}

export interface RepoRecommendationsResponse {
  success: true;

  status: "done";

  matchedRepositories: MatchedRepository[];

  cached: boolean;

  generatedAt?: string;
}

export interface RepoAuthRequiredResponse {
  success: false;

  status: "auth_required";

  sessionId: string;

  authUrls: {
    name: string;
    authUrl: string;
  }[];
}

export type RepoRecommendationsResult =
  | RepoRecommendationsResponse
  | RepoAuthRequiredResponse;
