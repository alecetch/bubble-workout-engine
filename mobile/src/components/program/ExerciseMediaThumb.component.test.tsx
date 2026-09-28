import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ExerciseMediaThumb } from "./ExerciseMediaThumb";

vi.mock("@expo/vector-icons", () => ({
  Ionicons: ({ name }: { name: string }) => <span>{name}</span>,
}));

// expo-video is mocked globally in vitest.setup.ts.

const baseProps = {
  stillImageUrl: "https://cdn.example.com/still.jpg",
  videoUrl: "https://cdn.example.com/video.mp4",
  posterImageUrl: "https://cdn.example.com/poster.jpg",
  videoStatus: "ready",
};

describe("ExerciseMediaThumb", () => {
  it("starts as a mini still with a play affordance when video is ready", () => {
    render(<ExerciseMediaThumb {...baseProps} />);

    expect(screen.getByTestId("exercise-media-thumb")).toBeInTheDocument();
    expect(screen.getByTestId("exercise-media-play-badge")).toBeInTheDocument();
  });

  it("shows a centered scrim and badge for a playable video", () => {
    render(<ExerciseMediaThumb {...baseProps} />);
    const overlay = screen.getByTestId("exercise-media-play-overlay");
    expect(overlay).toContainElement(screen.getByTestId("exercise-media-play-badge"));
    expect(overlay).toHaveStyle({ alignItems: "center", justifyContent: "center", pointerEvents: "none" });
  });

  it("expands the player after tapping the playable thumbnail", () => {
    render(<ExerciseMediaThumb {...baseProps} />);

    fireEvent.click(screen.getByLabelText("Play exercise video"));

    expect(screen.getByTestId("exercise-media-expanded")).toBeInTheDocument();
    expect(screen.getByLabelText("Minimize exercise video")).toBeInTheDocument();
    expect(screen.getByLabelText("Open exercise video fullscreen")).toBeInTheDocument();
  });

  it("opens fullscreen and closes back to expanded", () => {
    render(<ExerciseMediaThumb {...baseProps} />);

    fireEvent.click(screen.getByLabelText("Play exercise video"));
    fireEvent.click(screen.getByLabelText("Open exercise video fullscreen"));

    expect(screen.getByTestId("exercise-media-fullscreen")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Close exercise video fullscreen"));

    expect(screen.getByTestId("exercise-media-expanded")).toBeInTheDocument();
  });

  it("minimizes from expanded back to the mini thumbnail", () => {
    render(<ExerciseMediaThumb {...baseProps} />);

    fireEvent.click(screen.getByLabelText("Play exercise video"));
    fireEvent.click(screen.getByLabelText("Minimize exercise video"));

    expect(screen.getByTestId("exercise-media-thumb")).toBeInTheDocument();
  });

  it("renders still-only media without a video affordance", () => {
    render(<ExerciseMediaThumb {...baseProps} videoUrl={null} videoStatus="none" />);

    expect(screen.getByTestId("exercise-media-thumb")).toBeInTheDocument();
    expect(screen.queryByTestId("exercise-media-play-badge")).not.toBeInTheDocument();
    expect(screen.queryByTestId("exercise-media-play-overlay")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Play exercise video")).not.toBeInTheDocument();
  });
});
