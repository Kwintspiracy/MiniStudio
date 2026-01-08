import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  ActivityIndicator,
  StyleSheet,
  StatusBar,
  Platform,
  Dimensions,
  SafeAreaView
} from 'react-native';
import { router } from 'expo-router';
import Svg, { Path, Rect, Circle } from 'react-native-svg';
import { useAuth } from '../../src/context/AuthContext';
import { hasApiKey } from '../../src/services/storageService';

// Get screen dimensions
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Design System Colors
const colors = {
  background: {
    primary: '#1E1E2B',
    secondary: '#12121F',
    tertiary: 'rgba(255, 255, 255, 0.05)',
    dark: 'rgba(0, 0, 0, 0.3)',
  },
  text: {
    primary: '#F4F4F4',
    secondary: 'rgba(244, 244, 244, 0.4)',
    dark: '#1D1D1D',
  },
  button: {
    primary: '#0058DB',
    danger: '#FA0439',
    secondary: 'rgba(255, 255, 255, 0.05)',
  },
  accent: {
    blue: '#518CFF',
    red: '#FA0439',
    green: '#6BDE47',
  },
  border: {
    subtle: 'rgba(255, 255, 255, 0.05)',
    dashed: 'rgba(244, 244, 244, 0.4)',
  },
};

// Icons components
const ProBadgeIcon = ({ size = 12 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M20 6L9 17L4 12"
      stroke="#F4F4F4"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

const CreateIcon = ({ size = 16, color = "#F4F4F4" }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 5V19M5 12H19"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

const CameraIcon = ({ size = 16 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M23 19C23 19.5523 22.5523 20 22 20H2C1.44772 20 1 19.5523 1 19V7C1 6.44772 1.44772 6 2 6H7L9 3H15L17 6H22C22.5523 6 23 6.44772 23 7V19Z"
      stroke="#F4F4F4"
      strokeWidth={2}
      strokeLinejoin="round"
    />
    <Circle cx="12" cy="13" r="4" stroke="#F4F4F4" strokeWidth={2} />
  </Svg>
);

const GalleryIcon = ({ size = 16 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="3" y="3" width="18" height="18" rx="2" stroke="#F4F4F4" strokeWidth={2} />
    <Circle cx="8.5" cy="8.5" r="1.5" fill="#F4F4F4" />
    <Path d="M21 15L16 10L5 21" stroke="#F4F4F4" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const PaintIcon = ({ size = 16 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C13.66 22 15 20.66 15 19C15 18.24 14.69 17.55 14.19 17.06C14.07 16.94 14 16.78 14 16.61C14 16.27 14.27 16 14.61 16H16C19.31 16 22 13.31 22 10C22 5.58 17.52 2 12 2Z"
      stroke="rgba(244, 244, 244, 0.4)"
      strokeWidth={2}
    />
  </Svg>
);

export default function StudioFirstLaunch() {
  const { session, loading } = useAuth();
  
  useEffect(() => {
    if (!loading && !session) {
      router.replace('/signin');
    }
  }, [session, loading]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.button.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      
      {/* Top Navigation */}
      <View style={styles.topNav}>
        <View style={styles.proBadge}>
          <ProBadgeIcon />
          <Text style={styles.proBadgeText}>Pro</Text>
        </View>
        <Text style={styles.topTitle}>MINIPAINTERSTUDIO</Text>
        <View style={styles.rightAccessory} />
      </View>

      {/* Main Content Area */}
      <View style={styles.mainContentLaunch}>
        {/* Navigation Tabs */}
        <View style={styles.tabsContainer}>
          <TouchableOpacity style={styles.tabActive}>
            <CreateIcon size={16} />
            <Text style={styles.tabTextActive}>DESIGN</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tabInactive}>
            <PaintIcon size={16} />
            <Text style={styles.tabTextInactive}>PAINT</Text>
          </TouchableOpacity>
        </View>

        {/* Input Container */}
        <View style={styles.inputContainerLaunch}>
          <View style={styles.inputTextContainer}>
            <Text style={styles.launchInputTitle}>Input</Text>
            <Text style={styles.launchInputSubtitle}>Choose a image source</Text>
          </View>
          
          <View style={styles.optionsRow}>
            <TouchableOpacity style={styles.optionButtonLaunch} onPress={() => router.push('/camera')}>
              <CameraIcon />
              <Text style={styles.optionTextLaunch}>Take a Photo</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.optionButtonLaunch} onPress={() => {}}>
              <GalleryIcon />
              <Text style={styles.optionTextLaunch}>Load Image</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Bottom Navigation */}
      <View style={styles.bottomNavLaunch}>
        <View style={styles.bottomButtonsRow}>
          <TouchableOpacity style={styles.galleryButtonLaunch} onPress={() => {}}>
            <Text style={styles.galleryButtonTextLaunch}>Open Gallery</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.createButtonLaunch} onPress={() => {}}>
            <Text style={styles.createButtonTextLaunch}>Create</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 47,
    paddingHorizontal: 16,
    marginTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  proBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(107, 222, 71, 0.05)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.accent.green,
  },
  proBadgeText: {
    fontFamily: Platform.OS === 'ios' ? 'SF Pro' : 'System',
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.primary,
    letterSpacing: -0.41,
  },
  topTitle: {
    fontFamily: Platform.OS === 'ios' ? 'Sansita One' : 'System',
    fontSize: 20,
    fontWeight: '400',
    color: colors.text.primary,
    letterSpacing: -0.41,
    textAlign: 'center',
  },
  rightAccessory: {
    width: 91,
  },
  mainContentLaunch: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 7,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: colors.background.dark,
    borderRadius: 8,
    padding: 6,
    gap: 38,
  },
  tabActive: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.button.primary,
    borderRadius: 6,
    paddingVertical: 12,
  },
  tabInactive: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 12,
  },
  tabTextActive: {
    fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System',
    fontWeight: '600',
    fontSize: 14,
    color: colors.text.primary,
    letterSpacing: -0.41,
  },
  tabTextInactive: {
    fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System',
    fontWeight: '600',
    fontSize: 14,
    color: colors.text.secondary,
    letterSpacing: -0.41,
  },
  inputContainerLaunch: {
    height: 361,
    backgroundColor: colors.background.dark,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border.dashed,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 28,
  },
  inputTextContainer: {
    alignItems: 'center',
    gap: 8,
  },
  launchInputTitle: {
    fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System',
    fontWeight: '700',
    fontSize: 20,
    color: colors.text.primary,
    letterSpacing: -0.41,
  },
  launchInputSubtitle: {
    fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System',
    fontWeight: '400',
    fontSize: 14,
    color: colors.text.secondary,
    letterSpacing: -0.41,
  },
  optionsRow: {
    flexDirection: 'row',
    gap: 16,
  },
  optionButtonLaunch: {
    backgroundColor: colors.background.tertiary,
    borderRadius: 4,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 8,
  },
  optionTextLaunch: {
    fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System',
    fontWeight: '500',
    fontSize: 14,
    color: colors.text.primary,
  },
  bottomNavLaunch: {
    backgroundColor: colors.background.secondary,
    paddingTop: 24,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  bottomButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  galleryButtonLaunch: {
    flex: 1,
    height: 40,
    backgroundColor: colors.background.dark,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  galleryButtonTextLaunch: {
    fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System',
    fontWeight: '500',
    fontSize: 16,
    color: colors.text.primary,
    letterSpacing: -0.41,
  },
  createButtonLaunch: {
    flex: 1,
    height: 40,
    backgroundColor: colors.button.danger,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  createButtonTextLaunch: {
    fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System',
    fontWeight: '700',
    fontSize: 16,
    color: '#000000',
    letterSpacing: -0.41,
  },
});
