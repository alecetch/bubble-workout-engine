import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ExerciseMediaThumb } from "./ExerciseMediaThumb";
import { lastVideoPlayer } from "../../test/videoPlayerMock";

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
  it("prefers the thumb rendition and uses a card poster after expansion", () => {
    const { container } = render(<ExerciseMediaThumb {...baseProps} stillThumbUrl="https://cdn.test/thumb.webp" posterCardUrl="https://cdn.test/poster-card.webp" stillThumbhash="still-hash" />);
    expect(container.querySelector('img[src="https://cdn.test/thumb.webp"]')).toHaveAttribute("data-thumbhash", "still-hash");
    expect(container.querySelector('img[src="https://cdn.test/thumb.webp"]')).toHaveAttribute("data-recycling-key", "https://cdn.test/thumb.webp");
    fireEvent.click(screen.getByLabelText("Play exercise video"));
    expect(container.querySelector('img[src="https://cdn.test/poster-card.webp"]')).toHaveAttribute("data-thumbhash", "still-hash");
  });

  it("falls back to the original still without a thumbnail rendition", () => {
    const { container } = render(<ExerciseMediaThumb {...baseProps} />);
    expect(container.querySelector(`img[src="${baseProps.stillImageUrl}"]`)).toHaveAttribute("data-recycling-key", baseProps.stillImageUrl);
  });

  it("creates an empty muted looping player without loading or playing a video", () => {
    render(<ExerciseMediaThumb {...baseProps} />);
    const player = lastVideoPlayer.current!;
    expect(player.initialSource).toBeNull();
    expect(player.loop).toBe(true);
    expect(player.muted).toBe(true);
    expect(player.play).not.toHaveBeenCalled();
    expect(player.replace).not.toHaveBeenCalled();
    expect(player.replaceAsync).not.toHaveBeenCalled();
  });

  it("expands immediately while the first source loads, then plays", async () => {
    render(<ExerciseMediaThumb {...baseProps} />);
    const player = lastVideoPlayer.current!;
    let finishLoad!: () => void;
    player.replaceAsync.mockReturnValueOnce(new Promise<void>(resolve => { finishLoad = resolve; }));

    fireEvent.click(screen.getByLabelText("Play exercise video"));

    expect(screen.getByTestId("exercise-media-expanded")).toBeInTheDocument();
    expect(player.replaceAsync).toHaveBeenCalledTimes(1);
    expect(player.replaceAsync).toHaveBeenCalledWith(baseProps.videoUrl);
    expect(player.play).not.toHaveBeenCalled();
    await act(async () => finishLoad());
    await waitFor(() => expect(player.play).toHaveBeenCalledTimes(1));
    expect(player.replaceAsync.mock.invocationCallOrder[0]).toBeLessThan(player.play.mock.invocationCallOrder[0]);
  });

  it("pauses on minimise and resumes the same player without reloading", async () => {
    render(<ExerciseMediaThumb {...baseProps} />);
    const player = lastVideoPlayer.current!;
    fireEvent.click(screen.getByLabelText("Play exercise video"));
    await waitFor(() => expect(player.play).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByLabelText("Minimize exercise video"));
    expect(player.pause).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("exercise-media-thumb")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Play exercise video"));
    await waitFor(() => expect(player.play).toHaveBeenCalledTimes(2));
    expect(lastVideoPlayer.current).toBe(player);
    expect(player.replaceAsync).toHaveBeenCalledTimes(1);
    expect(player.replace).not.toHaveBeenCalled();
  });

  it("keeps the same loaded player when opening and closing fullscreen", async () => {
    render(<ExerciseMediaThumb {...baseProps} />);
    const player = lastVideoPlayer.current!;
    fireEvent.click(screen.getByLabelText("Play exercise video"));
    await waitFor(() => expect(player.play).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByLabelText("Open exercise video fullscreen"));
    expect(screen.getByTestId("exercise-media-fullscreen")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Close exercise video fullscreen"));
    expect(screen.getByTestId("exercise-media-expanded")).toBeInTheDocument();
    expect(lastVideoPlayer.current).toBe(player);
    expect(player.replaceAsync).toHaveBeenCalledTimes(1);
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(player.pause).not.toHaveBeenCalled();
  });

  it("treats a load error reported after replaceAsync resolves as unloaded and reloads on the next tap", async () => {
    render(<ExerciseMediaThumb {...baseProps} />);
    const player = lastVideoPlayer.current!;
    fireEvent.click(screen.getByLabelText("Play exercise video"));
    await waitFor(() => expect(player.play).toHaveBeenCalledTimes(1));

    // Offline: the source was accepted but the download fails afterwards.
    act(() => player.emit("statusChange", { status: "error", oldStatus: "loading" }));
    expect(screen.getByTestId("exercise-media-thumb")).toBeInTheDocument();
    expect(screen.getByTestId("exercise-media-play-badge")).toBeInTheDocument();
    // The failed source is cleared so the retry starts from an empty player.
    expect(player.replaceAsync).toHaveBeenLastCalledWith(null);

    fireEvent.click(screen.getByLabelText("Play exercise video"));
    await waitFor(() => expect(player.replaceAsync).toHaveBeenCalledTimes(3));
    expect(player.replaceAsync).toHaveBeenLastCalledWith(baseProps.videoUrl);
    await waitFor(() => expect(player.play).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId("exercise-media-expanded")).toBeInTheDocument();
  });

  it("ignores non-error status changes", async () => {
    render(<ExerciseMediaThumb {...baseProps} />);
    const player = lastVideoPlayer.current!;
    fireEvent.click(screen.getByLabelText("Play exercise video"));
    await waitFor(() => expect(player.play).toHaveBeenCalledTimes(1));

    act(() => player.emit("statusChange", { status: "readyToPlay", oldStatus: "loading" }));
    expect(screen.getByTestId("exercise-media-expanded")).toBeInTheDocument();
  });

  it("restores the playable thumbnail after a failed load and retries on the next tap", async () => {
    render(<ExerciseMediaThumb {...baseProps} />);
    const player = lastVideoPlayer.current!;
    player.replaceAsync.mockRejectedValueOnce(new Error("Video unavailable"));
    fireEvent.click(screen.getByLabelText("Play exercise video"));
    await waitFor(() => expect(screen.getByTestId("exercise-media-thumb")).toBeInTheDocument());
    expect(screen.getByTestId("exercise-media-play-badge")).toBeInTheDocument();
    expect(player.play).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText("Play exercise video"));
    await waitFor(() => expect(player.play).toHaveBeenCalledTimes(1));
    expect(player.replaceAsync).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("exercise-media-expanded")).toBeInTheDocument();
  });

  it.each([
    { videoUrl: null, videoStatus: "ready" },
    { videoUrl: baseProps.videoUrl, videoStatus: "processing" },
  ])("does not load or play still-only media: %j", props => {
    render(<ExerciseMediaThumb {...baseProps} {...props} />);
    const player = lastVideoPlayer.current!;
    expect(screen.queryByLabelText("Play exercise video")).not.toBeInTheDocument();
    expect(player.replaceAsync).not.toHaveBeenCalled();
    expect(player.play).not.toHaveBeenCalled();
  });

  it("does not play when a pending load finishes after unmount", async () => {
    const { unmount } = render(<ExerciseMediaThumb {...baseProps} />);
    const player = lastVideoPlayer.current!;
    let finishLoad!: () => void;
    player.replaceAsync.mockReturnValueOnce(new Promise<void>(resolve => { finishLoad = resolve; }));
    fireEvent.click(screen.getByLabelText("Play exercise video"));
    unmount();
    await act(async () => finishLoad());
    expect(player.play).not.toHaveBeenCalled();
  });

  it("does not start hidden playback if minimised while loading", async () => {
    render(<ExerciseMediaThumb {...baseProps} />);
    const player = lastVideoPlayer.current!;
    let finishLoad!: () => void;
    player.replaceAsync.mockReturnValueOnce(new Promise<void>(resolve => { finishLoad = resolve; }));
    fireEvent.click(screen.getByLabelText("Play exercise video"));
    fireEvent.click(screen.getByLabelText("Minimize exercise video"));
    await act(async () => finishLoad());
    expect(player.pause).toHaveBeenCalledTimes(1);
    expect(player.play).not.toHaveBeenCalled();
    expect(screen.getByTestId("exercise-media-thumb")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Play exercise video"));
    await waitFor(() => expect(player.play).toHaveBeenCalledTimes(1));
    expect(player.replaceAsync).toHaveBeenCalledTimes(1);
  });

  it("returns to the thumbnail and loads the new source only on tap when the video changes", async () => {
    const { rerender } = render(<ExerciseMediaThumb {...baseProps} />);
    const player = lastVideoPlayer.current!;
    fireEvent.click(screen.getByLabelText("Play exercise video"));
    await waitFor(() => expect(player.play).toHaveBeenCalledTimes(1));
    rerender(<ExerciseMediaThumb {...baseProps} videoUrl="https://cdn.example.com/other.mp4" />);
    expect(player.pause).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("exercise-media-thumb")).toBeInTheDocument();
    expect(player.replaceAsync).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByLabelText("Play exercise video"));
    await waitFor(() => expect(player.play).toHaveBeenCalledTimes(2));
    expect(player.replaceAsync).toHaveBeenLastCalledWith("https://cdn.example.com/other.mp4");
  });

  it("ignores an old load that finishes after the row changes to still-only media", async () => {
    const { rerender } = render(<ExerciseMediaThumb {...baseProps} />);
    const player = lastVideoPlayer.current!;
    let finishLoad!: () => void;
    player.replaceAsync.mockReturnValueOnce(new Promise<void>(resolve => { finishLoad = resolve; }));
    fireEvent.click(screen.getByLabelText("Play exercise video"));
    rerender(<ExerciseMediaThumb {...baseProps} videoUrl={null} videoStatus="none" />);
    await act(async () => finishLoad());
    expect(player.play).not.toHaveBeenCalled();
    expect(screen.getByTestId("exercise-media-thumb")).toBeInTheDocument();
  });

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
