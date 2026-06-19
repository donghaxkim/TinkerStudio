import { z } from "zod";

export const PublicUrlSchema = z.string().url().refine((value) => {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}, "URL must use http or https");

const GithubOwnerSegmentPattern = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;
const GithubRepoSegmentPattern = /^(?=.*[A-Za-z0-9])[A-Za-z0-9._-]+$/;

export const PublicGithubRepoUrlSchema = z.string().url().refine((value) => {
  try {
    const url = new URL(value);
    const pathMatch = /^\/([^/]+)\/([^/]+)$/.exec(url.pathname);

    if (pathMatch === null) {
      return false;
    }

    const ownerName = decodeURIComponent(pathMatch[1]);
    const repoPathSegment = decodeURIComponent(pathMatch[2]);
    const repoName = repoPathSegment.endsWith(".git") ? repoPathSegment.slice(0, -4) : repoPathSegment;

    return (
      url.protocol === "https:" &&
      url.hostname === "github.com" &&
      url.port === "" &&
      url.username === "" &&
      url.password === "" &&
      url.search === "" &&
      url.hash === "" &&
      GithubOwnerSegmentPattern.test(ownerName) &&
      GithubRepoSegmentPattern.test(repoName) &&
      repoName !== "." &&
      repoName !== ".."
    );
  } catch {
    return false;
  }
}, "repoUrl must be a public GitHub repository root URL");
