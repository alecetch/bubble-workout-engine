import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { SessionExerciseSegmentSection } from "./SessionExerciseSegmentSection";

vi.mock("@expo/vector-icons", () => ({
  Ionicons: ({ name }: { name: string }) => <span>{name}</span>,
}));

const items = [
  {
    id: "pe-warmup-1",
    exerciseId: "warmup-glute-bridge",
    name: "Glute Bridge",
    cueText: "Pause at the top.",
    rounds: 2,
    durationOrRepsLabel: "10 reps",
    stillImageUrl: "https://cdn.example.com/still.jpg",
    videoUrl: "https://cdn.example.com/video.mp4",
    posterImageUrl: "https://cdn.example.com/poster.jpg",
    videoStatus: "ready" as const,
  },
];

describe("SessionExerciseSegmentSection", () => {
  it("starts collapsed with a header and chevron", () => {
    render(<SessionExerciseSegmentSection title="Warm-up" items={items} />);

    expect(screen.getByText("Warm-up")).toBeInTheDocument();
    expect(screen.getByText("1 item")).toBeInTheDocument();
    expect(screen.getByText("chevron-down")).toBeInTheDocument();
    expect(screen.queryByText("Glute Bridge")).not.toBeInTheDocument();
  });

  it("expands item cards with copy and media", () => {
    render(<SessionExerciseSegmentSection title="Warm-up" items={items} />);

    fireEvent.click(screen.getByTestId("warmup-toggle"));

    expect(screen.getByText("Glute Bridge")).toBeInTheDocument();
    expect(screen.getByText("2 rounds · 10 reps")).toBeInTheDocument();
    expect(screen.getByText("Pause at the top.")).toBeInTheDocument();
    expect(screen.getByTestId("exercise-media-thumb")).toBeInTheDocument();
  });

  it("renders nothing for empty items", () => {
    const { queryByTestId } = render(<SessionExerciseSegmentSection title="Warm-up" items={[]} />);

    expect(queryByTestId("warmup-segment-section")).not.toBeInTheDocument();
  });
});

it("renders the cool-down title", () => {
  render(<SessionExerciseSegmentSection title="Cool-down" items={items} />);
  expect(screen.getByText("Cool-down")).toBeInTheDocument();
});
