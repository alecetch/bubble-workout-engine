import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, test } from "vitest";
import { App } from "../App";

describe("HYROX carousel compatibility route", () => {
  test("old email carousel links point to the API carousel route", () => {
    render(
      <MemoryRouter initialEntries={["/hyrox/carousel/sub-123"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: /open your instagram carousel slides/i })).toHaveAttribute(
      "href",
      "/api/hyrox/carousel/sub-123",
    );
  });
});
