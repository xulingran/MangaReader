import React, { Fragment, useMemo } from 'react';
import { StatusBar, HStack, Text, Box } from 'native-base';
import { NativeStackHeaderProps } from '@react-navigation/native-stack';
import { getHeaderTitle } from '@react-navigation/elements';
import VectorIcon from '~/components/VectorIcon';

interface HeaderProps extends NativeStackHeaderProps {
  showUpdateIndicator?: boolean;
}

const Header = ({ navigation, options, route, showUpdateIndicator = false }: HeaderProps) => {
  const title = getHeaderTitle(options, route.name);
  const canGoBack = useMemo(() => navigation.canGoBack(), [navigation]);

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
      <StatusBar backgroundColor="white" barStyle="dark-content" />
      <HStack
        bg="white"
        p={1}
        w="full"
        justifyContent="space-between"
        alignItems="center"
        borderBottomWidth={1}
        borderColor="black"
        safeAreaTop
        safeAreaLeft
        safeAreaRight
      >
        <HStack flex={1} flexGrow={1} justifyContent="flex-start" alignItems="center">
          {canGoBack ? (
            <VectorIcon name="arrow-back" size="2xl" onPress={handleBack} />
          ) : (
            <Box>
              <VectorIcon name="home" size="2xl" onPress={handleAbout} />
              {showUpdateIndicator && (
                <Box
                  position="absolute"
                  top={1}
                  right={1}
                  w={2}
                  h={2}
                  borderRadius="full"
                  bg="black"
                />
              )}
            </Box>
          )}
          {title !== '' && (
            <Text flex={1} color="black" fontSize={25} fontWeight="bold" numberOfLines={1}>
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
