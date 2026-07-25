import { useSafeAreaInsets, EdgeInsets } from 'react-native-safe-area-context';
import { ScaledSize, useWindowDimensions } from 'react-native';
import { useMemo } from 'react';
import { useDebouncedValue } from './useDebouncedValue';

interface SplitWidthLimit {
  gap?: number;
  width?: number;
  reservedWidth?: number;
  minNumColumns?: number;
  maxSplitWidth?: number;
}

export function splitWidth(
  dimensions: ScaledSize,
  insets: EdgeInsets,
  { gap, width, reservedWidth, minNumColumns, maxSplitWidth }: Required<SplitWidthLimit>
) {
  const { width: windowWidth, height: windowHeight } = dimensions;
  const defaultWidth = windowWidth - insets.left - insets.right - reservedWidth;
  const maxWindowSplitWidth = Math.min(windowWidth, windowHeight) / minNumColumns;

  const numColumns = Math.max(
    Math.floor((width || defaultWidth) / Math.min(maxSplitWidth, maxWindowSplitWidth)),
    minNumColumns
  );
  const itemWidth = ((width || defaultWidth) - gap * (numColumns + 1)) / numColumns;

  return { gap, insets, itemWidth, numColumns, windowWidth, windowHeight };
}

export const useSplitWidth = ({
  gap = 0,
  width = 0,
  reservedWidth = 0,
  minNumColumns = 3,
  maxSplitWidth = Infinity,
}: SplitWidthLimit) => {
  const insets = useDebouncedValue(useSafeAreaInsets(), 1000);
  const windowDimensions = useDebouncedValue(useWindowDimensions(), 1000);

  return useMemo(
    () =>
      splitWidth(windowDimensions, insets, {
        gap,
        width,
        reservedWidth,
        minNumColumns,
        maxSplitWidth,
      }),
    [insets, windowDimensions, gap, width, reservedWidth, minNumColumns, maxSplitWidth]
  );
};
