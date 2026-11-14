import { BRAND } from "../../config/brand";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, test } from "vitest";
import { TopNav } from "../TopNav";

describe("TopNav", () => {
  test("renders the 200 Days masthead logo lockup", () => {
    render(
      <MemoryRouter>
        <TopNav />
      </MemoryRouter>,
    );

    const logo = screen.getByRole("img", { name: BRAND.name });
    expect(logo).toHaveAttribute("src", expect.stringContaining("200days-lockup.svg"));
    expect(screen.queryByText("Performance Engineer")).not.toBeInTheDocument();
  });
});
