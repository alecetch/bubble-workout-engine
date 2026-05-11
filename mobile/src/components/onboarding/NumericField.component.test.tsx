import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NumericField } from "./NumericField";

function renderField(props: Partial<React.ComponentProps<typeof NumericField>> = {}) {
  const onChangeText = vi.fn();
  render(
    <NumericField
      label="Body weight"
      value=""
      onChangeText={onChangeText}
      placeholder="82"
      {...props}
    />,
  );
  return onChangeText;
}

describe("NumericField", () => {
  it("renders the label text", () => {
    renderField();
    expect(screen.getByText("Body weight")).toBeInTheDocument();
  });

  it("calls onChangeText with the new value", () => {
    const onChangeText = renderField();
    fireEvent.change(screen.getByPlaceholderText("82"), { target: { value: "90" } });
    expect(onChangeText).toHaveBeenCalledWith("90");
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
