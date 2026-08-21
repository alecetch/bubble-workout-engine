import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { InlineRestStrip } from "./InlineRestStrip";

vi.mock("@expo/vector-icons", () => ({
  Ionicons: ({ name }: { name: string }) => <span>{name}</span>,
}));

vi.mock("../../interaction/PressableScale", () => ({
  PressableScale: ({ children, onLongPress, onPress }: any) => (
    <button type="button" onContextMenu={() => onLongPress?.()} onClick={() => onPress?.()}>
      {children}
    </button>
  ),
}));

function renderStrip(props: Partial<React.ComponentProps<typeof InlineRestStrip>> = {}) {
  return render(
    <InlineRestStrip
      restDisplaySeconds={props.restDisplaySeconds ?? 90}
      restProgress={props.restProgress ?? 0.5}
      showAdjustControls={props.showAdjustControls ?? false}
      onToggleAdjust={props.onToggleAdjust ?? vi.fn()}
      onReset={props.onReset ?? vi.fn()}
      onAdjust={props.onAdjust ?? vi.fn()}
      onAdjustLongPress={props.onAdjustLongPress ?? vi.fn()}
    />,
  );
}

describe("InlineRestStrip", () => {
  it("renders formatted restDisplaySeconds", () => {
    renderStrip({ restDisplaySeconds: 75 });

    expect(screen.getByText("01:15")).toBeInTheDocument();
  });

  it("calls onReset when Reset is tapped", () => {
    const onReset = vi.fn();
    renderStrip({ onReset });

    fireEvent.click(screen.getByText("Reset"));

    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
