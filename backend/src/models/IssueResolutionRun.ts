import { Schema, model, Types } from "mongoose";

export type IssueResolutionPhase =
  | "investigating"
  | "awaiting_approval"
  | "implementing"
  | "done"
  | "failed";

export interface IssueResolutionRunDoc {
  user: Types.ObjectId;
  issueUrl: string;
  owner: string;
  repo: string;
  issueNumber: number;
  sessionId: string;
  phase: IssueResolutionPhase;
  deepDiveReport: string | null;
  solverReport: string | null;
  solverStatus: string | null;
  generatedAt: Date;
}

const schema = new Schema<IssueResolutionRunDoc>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    issueUrl: { type: String, required: true },
    owner: { type: String, required: true },
    repo: { type: String, required: true },
    issueNumber: { type: Number, required: true },
    sessionId: { type: String, required: true },
    phase: {
      type: String,
      enum: [
        "investigating",
        "awaiting_approval",
        "implementing",
        "done",
        "failed",
      ],
      default: "investigating",
    },
    deepDiveReport: { type: String, default: null },
    solverReport: { type: String, default: null },
    solverStatus: { type: String, default: null },
    generatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

// One run per (user, issue) — re-investigating overwrites the previous run.
schema.index({ user: 1, issueUrl: 1 }, { unique: true });

export default model<IssueResolutionRunDoc>("IssueResolutionRun", schema);
