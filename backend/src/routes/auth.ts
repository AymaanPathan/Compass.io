import { Router, Request, Response } from "express";
import axios from "axios";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import User from "../models/User";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { githubClient } from "../utils/githubClient";

const router = Router();

const isProd = process.env.NODE_ENV === "production";

// Step 1: redirect user to GitHub's authorize screen
router.get("/github", (req: Request, res: Response) => {
  const state = crypto.randomBytes(16).toString("hex");

  // store state in a short-lived cookie to verify on callback (CSRF protection)
  res.cookie("oauth_state", state, {
    httpOnly: true,
    maxAge: 5 * 60 * 1000,
    sameSite: "lax",
  });

  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID as string,
    redirect_uri: process.env.GITHUB_CALLBACK_URL as string,
    scope: "read:user user:email repo",
    state,
  });

  res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
});

// Step 2: GitHub redirects back here with a code
router.get("/github/callback", async (req: Request, res: Response) => {
  const { code, state } = req.query;
  const savedState = req.cookies?.oauth_state;

  if (!code || !state || state !== savedState) {
    return res.redirect(`${process.env.CLIENT_URL}?error=invalid_state`);
  }

  try {
    // exchange code for access token
    const tokenRes = await axios.post(
      "https://github.com/login/oauth/access_token",
      {
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: process.env.GITHUB_CALLBACK_URL,
      },
      { headers: { Accept: "application/json" } },
    );

    const accessToken = tokenRes.data.access_token;
    if (!accessToken) {
      return res.redirect(
        `${process.env.CLIENT_URL}?error=token_exchange_failed`,
      );
    }

    const gh = githubClient(accessToken);

    const profileRes = await gh.get("/user");

    let email: string | undefined;
    try {
      const emailsRes = await gh.get("/user/emails");
      const primary =
        emailsRes.data.find((e: any) => e.primary) || emailsRes.data[0];
      email = primary?.email;
    } catch {
      // email scope might be restricted; not fatal
    }

    const profile = profileRes.data;

    const user = await User.findOneAndUpdate(
      { githubId: String(profile.id) },
      {
        githubId: String(profile.id),
        username: profile.login,
        displayName: profile.name || profile.login,
        avatarUrl: profile.avatar_url,
        email,
        accessToken,
      },
      { upsert: true, returnDocument: "after" },
    );

    const jwtToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET as string,
      {
        expiresIn: "7d",
      },
    );

    res.clearCookie("oauth_state");
    res.cookie("token", jwtToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.redirect(`${process.env.CLIENT_URL}/sessions`);
  } catch (err: any) {
    console.error("GitHub OAuth error:", err.response?.data || err.message);
    res.redirect(`${process.env.CLIENT_URL}?error=oauth_failed`);
  }
});

// current logged-in user
router.get("/me", requireAuth, async (req: AuthRequest, res: Response) => {
  const user = await User.findById(req.userId).select("-accessToken");
  if (!user)
    return res.status(404).json({ success: false, error: "User not found" });
  res.json({ success: true, user });
});

// logout
router.post("/logout", (req: Request, res: Response) => {
  res.clearCookie("token");
  res.json({ success: true });
});

export default router;
