import React, { useState } from 'react';
import { View, Text, Modal, StyleSheet, TouchableOpacity, Image, useWindowDimensions, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Polygon } from 'react-native-svg';

// Polygon color - easy to customize
const POLYGON_COLOR = '#3E516E'; // Blue

// Polygon vertical positions as percentages (responsive to screen height)
// Adjust these percentages to change polygon positions proportionally across all screen sizes
const POLYGON_POSITIONS = {
  screen2: {
    topLeft: 0.458,    // 45.8% down from top
    topRight: 0.180,   // 15.3% down from top
    bottom: 0.939,     // 93.9% down from top
  },
  screen3: {
    topLeft: 0.135,    // 15.3% down from top
    topRight: 0.380,   // 41.7% down from top
    bottom: 0.939,     // 93.9% down from top
  },
  screen4: {
    topLeft: 0.506
    ,    // 56.3% down from top
    topRight: 0.235,   // 25.8% down from top
    bottom: 0.939,     // 93.9% down from top
  },
};

interface OnboardingScreen {
  title: string;
  description: string;
  buttonText: string;
  imageKey: string;
}

const onboardingScreens: OnboardingScreen[] = [
  {
    title: 'Welcome to MiniPainter Studio',
    description: 'Everything you need to plan a great paint job before you pick up a brush.',
    buttonText: 'Start the tour',
    imageKey: 'onboarding_1',
  },
  {
    title: 'Build your paint themes',
    description: 'Test different color combinations, styles and effects before you commit.',
    buttonText: 'Next',
    imageKey: 'onboarding_2',
  },
  {
    title: 'Studio-quality miniature renders',
    description: 'Upload a sketch or a miniature photo, and get a clean render ready for painting.',
    buttonText: 'Next',
    imageKey: 'onboarding_3',
  },
  {
    title: 'Brainstorm from your sketches',
    description: 'Turn rough drafts into detailed character concepts, ready for sculpting.',
    buttonText: 'Finish',
    imageKey: 'onboarding_4',
  },
];

const imageMap = {
  onboarding_1: require('../../img/onboarding_1.png'),
  onboarding_2: require('../../img/onboarding_2.png'),
  onboarding_3: require('../../img/onboarding_3.png'),
  onboarding_4: require('../../img/onboarding_4.png'),
};

interface WelcomeOnboardingProps {
  visible: boolean;
  onComplete: () => void;
}

export const WelcomeOnboarding: React.FC<WelcomeOnboardingProps> = ({ visible, onComplete }) => {
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
  const [currentScreen, setCurrentScreen] = useState(0);

  const handleNext = () => {
    if (currentScreen < onboardingScreens.length - 1) {
      setCurrentScreen(currentScreen + 1);
    } else {
      onComplete();
    }
  };

  const handlePrevious = () => {
    if (currentScreen > 0) {
      setCurrentScreen(currentScreen - 1);
    }
  };

  const screen = onboardingScreens[currentScreen];

  return (
    <Modal visible={visible} animationType="fade" presentationStyle="fullScreen">
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.content}>
          {currentScreen === 1 && (
            <Svg
              style={styles.blueLayerSvg}
              width={SCREEN_WIDTH}
              height="100%"
            >
              <Polygon
                points={`0,${SCREEN_HEIGHT * POLYGON_POSITIONS.screen2.topLeft} ${SCREEN_WIDTH},${SCREEN_HEIGHT * POLYGON_POSITIONS.screen2.topRight} ${SCREEN_WIDTH},${SCREEN_HEIGHT * POLYGON_POSITIONS.screen2.bottom} 0,${SCREEN_HEIGHT * POLYGON_POSITIONS.screen2.bottom}`}
                fill={POLYGON_COLOR}
              />
            </Svg>
          )}
          {currentScreen === 2 && (
            <Svg
              style={styles.blueLayerSvg}
              width={SCREEN_WIDTH}
              height="100%"
            >
              <Polygon
                points={`0,${SCREEN_HEIGHT * POLYGON_POSITIONS.screen3.topLeft} ${SCREEN_WIDTH},${SCREEN_HEIGHT * POLYGON_POSITIONS.screen3.topRight} ${SCREEN_WIDTH},${SCREEN_HEIGHT * POLYGON_POSITIONS.screen3.bottom} 0,${SCREEN_HEIGHT * POLYGON_POSITIONS.screen3.bottom}`}
                fill={POLYGON_COLOR}
              />
            </Svg>
          )}
          {currentScreen === 3 && (
            <Svg
              style={styles.blueLayerSvg}
              width={SCREEN_WIDTH}
              height="100%"
            >
              <Polygon
                points={`0,${SCREEN_HEIGHT * POLYGON_POSITIONS.screen4.topLeft} ${SCREEN_WIDTH},${SCREEN_HEIGHT * POLYGON_POSITIONS.screen4.topRight} ${SCREEN_WIDTH},${SCREEN_HEIGHT * POLYGON_POSITIONS.screen4.bottom} 0,${SCREEN_HEIGHT * POLYGON_POSITIONS.screen4.bottom}`}
                fill={POLYGON_COLOR}
              />
            </Svg>
          )}
          <View style={styles.imageContainer}>
            <Image
              key={screen.imageKey}
              source={imageMap[screen.imageKey as keyof typeof imageMap]}
              style={[
                styles.onboardingImage,
                screen.imageKey === 'onboarding_1' && styles.onboardingImageSmall
              ]}
              resizeMode="contain"
            />
          </View>

          <View style={[styles.footer, { width: SCREEN_WIDTH }]}>
            <View style={styles.textContainer}>
              <Text style={styles.title}>{screen.title}</Text>
              <Text style={styles.description}>{screen.description}</Text>
            </View>

            {currentScreen === 0 ? (
              <View style={[styles.buttonContainer, { justifyContent: 'center' }]}>
                <TouchableOpacity
                  style={styles.singleButton}
                  onPress={handleNext}
                  activeOpacity={0.8}
                  accessibilityLabel="Start the tour"
                  accessibilityRole="button"
                >
                  <Text style={styles.onboardingButtonText}>Start the tour</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.buttonContainer}>
                <TouchableOpacity
                  style={styles.previousButton}
                  onPress={handlePrevious}
                  activeOpacity={0.8}
                  accessibilityLabel="Previous"
                  accessibilityRole="button"
                >
                  <Text style={styles.previousButtonText} numberOfLines={1} ellipsizeMode="clip">Previous</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.nextButton}
                  onPress={handleNext}
                  activeOpacity={0.8}
                  accessibilityLabel={screen.buttonText}
                  accessibilityRole="button"
                >
                  <Text style={styles.nextButtonText} numberOfLines={1} ellipsizeMode="clip">{screen.buttonText}</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.pageIndicators}>
              {onboardingScreens.map((_, index) => (
                <View
                  key={index}
                  style={[
                    styles.pageIndicator,
                    index === currentScreen && styles.pageIndicatorActive,
                  ]}
                />
              ))}
            </View>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#2C2F3A',
  },
  content: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingTop: 50,
  },
  blueLayerSvg: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  imageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'stretch',
    paddingHorizontal: 24,
  },
  onboardingImage: {
    width: '100%',
    height: '100%',
    maxHeight: 400,
  },
  onboardingImageSmall: {
    maxHeight: 200,
  },
  footer: {
    backgroundColor: '#1F2129',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 50,
    gap: 40,
  },
  textContainer: {
    alignItems: 'center',
    alignSelf: 'stretch',
    gap: 16,
  },
  title: {
    fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto',
    fontWeight: '700',
    fontSize: 32,
    lineHeight: 38,
    textAlign: 'center',
    color: '#F4F4F4',
    maxWidth: 302,
  },
  description: {
    fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto',
    fontWeight: '400',
    fontSize: 18,
    lineHeight: 21.5,
    textAlign: 'center',
    color: '#878892',
    alignSelf: 'stretch',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'stretch',
    alignSelf: 'stretch',
    gap: 8,
  },
  onboardingButton: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  singleButton: {
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 64,
    backgroundColor: '#EFEFF1',
  },
  previousButton: {
    flex: 1,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    width: 0,
    minWidth: 0,
    maxWidth: '50%',
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#464B5D',
    overflow: 'hidden',
  },
  nextButton: {
    flex: 1,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    width: 0,
    minWidth: 0,
    maxWidth: '100%',
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#EFEFF1',
    overflow: 'hidden',
  },
  onboardingButtonText: {
    fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto',
    fontWeight: '500',
    fontSize: 16,
    textAlign: 'center',
    color: '#1D1D1D',
    includeFontPadding: false,
  },
  previousButtonText: {
    fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto',
    fontWeight: '500',
    fontSize: 16,
    textAlign: 'center',
    color: '#EFEFF1',
    includeFontPadding: false,
  },
  nextButtonText: {
    fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto',
    fontWeight: '500',
    fontSize: 16,
    textAlign: 'center',
    color: '#1D1D1D',
    includeFontPadding: false,
  },
  pageIndicators: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  pageIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  pageIndicatorActive: {
    backgroundColor: '#EFEFF1',
    width: 24,
  },
});
