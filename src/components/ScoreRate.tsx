import React, { useMemo } from 'react';
import { Box, Center, HStack } from 'native-base';
import { useThemePalette } from '~/utils/theme/hooks';

interface ScoreRateProps {
  score?: number;
  max?: number;
}

const ScoreRate = ({ score = 0, max = 5 }: ScoreRateProps) => {
  const rateList = useMemo(() => Array.from({ length: max }, (_v, i) => i < score), [score, max]);
  const palette = useThemePalette();

  return (
    <HStack>
      {rateList.map((actived, index) => (
        <Center w={3} h={3} overflow="hidden" key={index}>
          <Box
            w={2}
            h={6}
            style={{ transform: [{ rotate: '20deg' }] }}
            key={index}
            bgColor={actived ? palette.text : palette.disabled}
          />
        </Center>
      ))}
    </HStack>
  );
};

export default ScoreRate;
