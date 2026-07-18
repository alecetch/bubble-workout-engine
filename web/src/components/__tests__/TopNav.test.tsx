import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, test } from "vitest";
import { TopNav } from "../TopNav";

describe("TopNav", () => {
  test("renders the Forma masthead logo lockup", () => {
    render(
      <MemoryRouter>
        <TopNav />
      </MemoryRouter>,
    );

    const logo = screen.getByRole("img", { name: "Forma — Measure. Understand. Improve." });
    expect(logo).toHaveAttribute("src", expect.stringContaining("forma-logo"));
    expect(screen.queryByText("Performance Engineer")).not.toBeInTheDocument();
  });
});
