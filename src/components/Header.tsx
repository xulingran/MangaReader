import React, { Fragment } from 'react';
import { StatusBar, HStack, Text, Box } from 'native-base';
import { NativeStackHeaderProps } from '@react-navigation/native-stack';
import { getHeaderTitle } from '@react-navigation/elements';
import VectorIcon from '~/components/VectorIcon';
import { useResolvedThemeMode, useThemePalette } from '~/utils/theme/hooks';

interface HeaderProps extends NativeStackHeaderProps {
  showUpdateIndicator?: boolean;
}

const Header = ({ navigation, options, route, showUpdateIndicator = false }: HeaderProps) => {
  const title = getHeaderTitle(options, route.name);
  const canGoBack = navigation.canGoBack();
  const palette = useThemePalette();
  const resolvedMode = useResolvedThemeMode();

  const handleAbout = () => {
    navigation.navigate('About');
  };
  const handleBack = () => {
    navigation.goBack();
  };

  const { headerLeft, headerRight } = options;
  const Left = headerLeft ? headerLeft({ canGoBack }) : null;
  const Right = headerRight ? headerRight({ canGoBack }) : null;

  return (
    <Fragment>
      <StatusBar
        backgroundColor={palette.header}
        barStyle={resolvedMode === 'dark' ? 'light-content' : 'dark-content'}
      />
      <HStack
        bg={palette.header}
        p={1}
        w="full"
        justifyContent="space-between"
        alignItems="center"
        borderBottomWidth={1}
        borderColor={palette.border}
        safeAreaTop
        safeAreaLeft
        safeAreaRight
      >
        <HStack flex={1} flexGrow={1} justifyContent="flex-start" alignItems="center">
          {canGoBack ? (
            <VectorIcon name="arrow-back" size="2xl" onPress={handleBack} />
          ) : (
            <Box>
              <VectorIcon name="home" size="2xl" label="设置" onPress={handleAbout} />
              {showUpdateIndicator && (
                <Box
                  position="absolute"
                  top={1}
                  right={1}
                  w={2}
                  h={2}
                  borderRadius="full"
                  bg={palette.selectedBg}
                />
              )}
            </Box>
          )}
          {title !== '' && (
            <Text flex={1} color={palette.text} fontSize={25} fontWeight="bold" numberOfLines={1}>
              {title}
            </Text>
          )}
          {Left}
        </HStack>

        {Right}
      </HStack>
    </Fragment>
  );
};

export default Header;
