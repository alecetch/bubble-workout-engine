import React from "react";
import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";

type RingTimerProps = {
  size: number;
  strokeWidth: number;
  progress: number;
  trackColor: string;
  progressColor: string;
  children?: React.ReactNode;
};

export function RingTimer(props: RingTimerProps): React.JSX.Element {
  const { size, strokeWidth, progress, trackColor, progressColor, children } = props;
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const ARC_GAP = 6;

  const radius = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * radius;
  const segmentLength = circumference / 4 - ARC_GAP;
  const currentQ = clampedProgress >= 1
    ? 4
    : Math.min(3, Math.floor(clampedProgress * 4));
  const progressInQ = clampedProgress * 4 - currentQ;

  return (
    <View style={{ width: size, height: size, alignSelf: "center" }}>
      <Svg
        width={size}
        height={size}
        style={{ position: "absolute", top: 0, left: 0 }}
      >
        <Circle
          cx={cx}
          cy={cy}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="butt"
        />
        {[0, 1, 2, 3].map((q) => {
          const visibleLength = q < currentQ
            ? segmentLength
            : q === currentQ
              ? progressInQ * segmentLength
              : 0;
          const opacity = q < currentQ ? 1.0 : q === currentQ ? 0.35 : 0;
          return (
            <Circle
              key={`quadrant-${q}`}
              cx={cx}
              cy={cy}
              r={radius}
              stroke={progressColor}
              strokeWidth={strokeWidth}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={[visibleLength, circumference - visibleLength]}
              strokeDashoffset={-(q * circumference / 4 + ARC_GAP / 2)}
              rotation={-90}
              origin={`${cx}, ${cy}`}
              opacity={opacity}
            />
          );
        })}
      </Svg>

      <View
        style={{
          position: "absolute",
          width: size,
          height: size,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {children}
      </View>
    </View>
  );
}
