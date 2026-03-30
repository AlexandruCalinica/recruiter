import * as arctic from "arctic";
import { env } from "../env";

export const github = new arctic.GitHub(
  env.GITHUB_CLIENT_ID,
  env.GITHUB_CLIENT_SECRET,
  env.GITHUB_REDIRECT_URI
);

export const gitlab =
  env.GITLAB_CLIENT_ID && env.GITLAB_CLIENT_SECRET
    ? new arctic.GitLab(
        "https://gitlab.com",
        env.GITLAB_CLIENT_ID,
        env.GITLAB_CLIENT_SECRET,
        env.GITLAB_REDIRECT_URI
      )
    : null;
