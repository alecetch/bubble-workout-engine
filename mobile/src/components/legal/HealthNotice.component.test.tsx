import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BRAND_WORDMARK } from "../../config/brand";
import { HealthNotice, HEALTH_NOTICE_TITLE, HEALTH_NOTICE_BODY, HEALTH_NOTICE_INJURY_LINE } from "./HealthNotice";

// React Native Web omits the native text role, so observe the native props too.
const viewProps = vi.hoisted(() => vi.fn());
vi.mock("react-native", async importActual => {
  const actual = await importActual<typeof import("react-native")>();
  return { ...actual, View: (props: React.ComponentProps<typeof actual.View>) => {
    viewProps(props);
    return <actual.View {...props} />;
  } };
});

describe("HealthNotice", () => {
  it("renders approved general copy and passes through testID without an injury line", () => {
    render(<HealthNotice testID="notice" />);
    expect(screen.getByText(HEALTH_NOTICE_TITLE)).toBeInTheDocument();
    expect(screen.getByText(HEALTH_NOTICE_BODY)).toBeInTheDocument();
    expect(HEALTH_NOTICE_BODY).toContain(BRAND_WORDMARK);
    expect(screen.getByTestId("notice")).toHaveAttribute("aria-label", `${HEALTH_NOTICE_TITLE} ${HEALTH_NOTICE_BODY}`);
    expect(viewProps).toHaveBeenCalledWith(expect.objectContaining({ accessible: true, accessibilityRole: "text", testID: "notice", accessibilityLabel: `${HEALTH_NOTICE_TITLE} ${HEALTH_NOTICE_BODY}` }));
    expect(screen.queryByTestId("health-notice-injury-line")).not.toBeInTheDocument();
  });

  it("adds the injury line to both the visible text and accessibility label", () => {
    render(<HealthNotice testID="notice" showInjuryLine />);
    expect(screen.getByTestId("health-notice-injury-line")).toHaveTextContent(HEALTH_NOTICE_INJURY_LINE);
    expect(screen.getByTestId("notice")).toHaveAttribute("aria-label", `${HEALTH_NOTICE_TITLE} ${HEALTH_NOTICE_BODY} ${HEALTH_NOTICE_INJURY_LINE}`);
    expect(viewProps).toHaveBeenCalledWith(expect.objectContaining({ accessible: true, accessibilityRole: "text", accessibilityLabel: `${HEALTH_NOTICE_TITLE} ${HEALTH_NOTICE_BODY} ${HEALTH_NOTICE_INJURY_LINE}` }));
  });
});
