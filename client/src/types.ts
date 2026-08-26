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
