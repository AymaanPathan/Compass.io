// models/User.ts
import mongoose, { Schema, Document } from "mongoose";

interface TechConfidence {
  name: string;
  confidence: number;
}

interface IDeveloperProfile {
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

interface MatchedRepository {
  name: string;
  url: string;
  description: string;
  repoType: string;
  whyItMatches: string;
}

export interface IUser extends Document {
  githubId: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  email?: string;
  accessToken: string;
  createdAt: Date;
  developerProfileStatus: "idle" | "running" | "auth_required";

  developerProfile?: IDeveloperProfile;
  developerProfileRaw?: string;
  developerProfileParseFailed?: boolean;
  developerProfileGeneratedAt?: Date;
  developerProfileSessionId?: string;

  // Repo recommender
  repoRecommendations?: MatchedRepository[];
  repoRecommendationsRaw?: string;
  repoRecommendationsParseFailed?: boolean;
  repoRecommendationsGeneratedAt?: Date;
  repoRecommendationsSessionId?: string;
  repoRecommendationsStatus?: "idle" | "running" | "auth_required";
}

const TechConfidenceSchema = new Schema(
  { name: String, confidence: Number },
  { _id: false },
);

const DeveloperProfileSchema = new Schema(
  {
    builderArchetype: String,
    developerType: String,
    summary: String,
    githubVibe: String,
    experienceLevel: String,
    strongestTechnologies: [TechConfidenceSchema],
    strengths: [String],
    engineeringPatterns: [String],
    contributionAreas: [String],
    funInsights: [String],
  },
  { _id: false },
);

const MatchedRepositorySchema = new Schema(
  {
    name: String,
    url: String,
    description: String,
    repoType: String,
    whyItMatches: String,
  },
  { _id: false },
);

const UserSchema = new Schema<IUser>({
  githubId: { type: String, required: true, unique: true },
  username: { type: String, required: true },
  displayName: { type: String },
  avatarUrl: { type: String },
  email: { type: String },
  accessToken: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  developerProfileStatus: {
    type: String,
    enum: ["idle", "running", "auth_required"],
    default: "idle",
  },

  developerProfile: { type: DeveloperProfileSchema, default: undefined },
  developerProfileRaw: { type: String },
  developerProfileParseFailed: { type: Boolean },
  developerProfileGeneratedAt: { type: Date },
  developerProfileSessionId: { type: String },

  // Repo recommender
  repoRecommendations: { type: [MatchedRepositorySchema], default: undefined },
  repoRecommendationsRaw: { type: String },
  repoRecommendationsParseFailed: { type: Boolean },
  repoRecommendationsGeneratedAt: { type: Date },
  repoRecommendationsSessionId: { type: String },
  repoRecommendationsStatus: {
    type: String,
    enum: ["idle", "running", "auth_required"],
    default: "idle",
  },
});

export default mongoose.model<IUser>("User", UserSchema);
