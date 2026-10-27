/** Which of the three Gershon platforms this build is. */
export const PRODUCT_NAME = "Social Tracking";
export const PRODUCT_HOME = "/dashboard";
export const PRODUCT_TAGLINE = "Was the agreed work done? Evidence for the monthly report";
export const PRODUCT_VERSION = "0.5.0";

/** Sign-in page copy (v0.2.1: was still Social's copy). */
export const PRODUCT_LOGIN_HEADLINE = "Check the agreed work was done, every month.";
export const PRODUCT_LOGIN_SUBLINE = "Posting evidence for our campaign and internal companies, ready for the monthly report.";
export const PRODUCT_LOGIN_POINTS = ["Work completion per company and month", "Monthly reports with evidence", "Campaign and internal companies only"];
export const PRODUCT_DESCRIPTION = "Social Tracking by Gershon.AI \u2014 work completion and monthly reports (internal)";

/**
 * Company categories this product serves (Olivier, 2026-10-26): Publish and
 * Social Tracking are for our CAMPAIGN clients and INTERNAL (Gershon) only.
 * Social keeps the whole ecosystem (partners, competition, prospects...).
 */
export const PRODUCT_CLIENT_TYPES = ["CAMPAIGN", "INTERNAL"] as const;
