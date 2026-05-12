import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MultilineField } from "./MultilineField";

function renderField(props: Partial<React.ComponentProps<typeof MultilineField>> = {}) {
  const onChangeText = vi.fn();
  render(
    <MultilineField
      label="Training notes"
      value=""
      onChangeText={onChangeText}
      placeholder="Tell us more"
      {...props}
    />,
  );
  return onChangeText;
}

describe("MultilineField", () => {
  it("renders the label text", () => {
    renderField();
    expect(screen.getByText("Training notes")).toBeInTheDocument();
  });

  it("renders the placeholder when value is empty", () => {
    renderField();
    expect(screen.getByPlaceholderText("Tell us more")).toBeInTheDocument();
  });

  it("calls onChangeText with the new value", () => {
    const onChangeText = renderField();
    fireEvent.change(screen.getByPlaceholderText("Tell us more"), { target: { value: "No Sundays" } });
    expect(onChangeText).toHaveBeenCalledWith("No Sundays");
  });

  it("shows the error string when provided", () => {
    renderField({ error: "Required" });
    expect(screen.getByText("Required")).toBeInTheDocument();
  });

  it("does not render an error when none is provided", () => {
    renderField();
    expect(screen.queryByText("Required")).not.toBeInTheDocument();
  });
});
