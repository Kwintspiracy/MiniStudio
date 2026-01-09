import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Image, TextInput,
  ActivityIndicator, Alert, Modal, StyleSheet, Platform, Dimensions, StatusBar, Share, Animated, Easing
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect, Circle } from 'react-native-svg';
import {
  XMarkIcon, RefreshIcon, ArrowsPointingOutIcon, DownloadIcon, CheckIcon
} from '../../src/components/Icons';
import type { ImageFile, ToolMode, DesignerType, HistoryItem, StyleOption } from '../../src/types';
import { usePrompts } from '../../src/hooks/usePrompts';
import { generatePaintedMiniature, generateImageFromImage, upscaleImage, cancelGeneration } from '../../src/services/geminiService';
import { fetchAllPaints, fetchUserPaints, PaletteColor } from '../../src/services/paintService';
import { useImagePicker } from '../../src/hooks/useImagePicker';
import { useMediaSave } from '../../src/hooks/useMediaSave';
import { useAuth } from '../../src/context/AuthContext';
import { PaintExplorerModal } from '../../src/components/PaintExplorerModal';
import * as FileSystem from 'expo-file-system/legacy';
import { shareAsync, isAvailableAsync } from 'expo-sharing';

// Get screen dimensions
const { width: SCREEN_WIDTH } = Dimensions.get('window');

// --- Dedicated SVG Icon Components ---

const AppTitleIcon = () => (
  <Svg width={182} height={14} viewBox="0 0 182 14" fill="none">
    <Path d="M14.68 12.9H10.24L12.08 4.26L7.34 12.9H4.62L3.72 3.96L1.8 12.9H0L2.7 0.2H7.8L8.42 7.36L12.26 0.2H17.4L14.68 12.9Z" fill="#0058DB" />
    <Path d="M20.787 12.9H16.467L19.167 0.2H23.507L20.787 12.9Z" fill="#0058DB" />
    <Path d="M33.2424 12.9H28.5624L26.3424 3.72L24.3824 12.9H22.5824L25.2824 0.2H30.0624L32.1624 9.5L34.1424 0.2H35.9824L33.2424 12.9Z" fill="#0058DB" />
    <Path d="M39.3655 12.9H35.0455L37.7455 0.2H42.0855L39.3655 12.9Z" fill="#0058DB" />
    <Path d="M47.581 7.42C47.981 7.42 48.3143 7.25333 48.581 6.92C48.861 6.58667 49.0876 6.18 49.261 5.7C49.4476 5.22 49.581 4.72 49.661 4.2C49.741 3.68 49.781 3.22667 49.781 2.84C49.781 2.48 49.721 2.18 49.601 1.94C49.481 1.68667 49.221 1.56 48.821 1.56H47.921L46.661 7.42H47.581ZM46.381 8.7L45.481 12.9H41.161L43.861 0.2H48.481C49.241 0.2 49.9343 0.24 50.561 0.320001C51.1876 0.4 51.7276 0.56 52.181 0.8C52.6343 1.04 52.9876 1.38667 53.241 1.84C53.4943 2.28 53.621 2.87333 53.621 3.62C53.621 4.31333 53.5076 4.97333 53.281 5.6C53.0676 6.21333 52.7143 6.75333 52.221 7.22C51.741 7.67333 51.1143 8.03333 50.341 8.3C49.5676 8.56667 48.6276 8.7 47.521 8.7H46.381Z" fill="#0058DB" />
    <Path d="M63.3173 12.9H58.6373L58.3573 9.72H54.6573L53.2373 12.9H51.2973L57.1973 0.2H61.9373L63.3173 12.9ZM55.3173 8.26H58.2173L57.7573 2.82L55.3173 8.26Z" fill="#0058DB" />
    <Path d="M68.1806 12.9H63.8606L66.5606 0.2H70.9006L68.1806 12.9Z" fill="#0058DB" />
    <Path d="M80.636 12.9H75.956L73.736 3.72L71.776 12.9H69.976L72.676 0.2H77.456L79.556 9.5L81.536 0.2H83.376L80.636 12.9Z" fill="#0058DB" />
    <Path d="M94.6191 1.72H91.3991L89.0191 12.9H84.6991L87.0791 1.72H83.8991L84.2591 0.2H94.9591L94.6191 1.72Z" fill="#F4F4F4" />
    <Path d="M95.8249 0.2H104.245L103.925 1.72H99.8449L99.0049 5.58H102.425L102.105 7.08H98.6849L97.7649 11.36H101.845L101.545 12.9H93.1249L95.8249 0.2Z" fill="#F4F4F4" />
    <Path d="M115.235 3.22C115.235 4.00667 115.015 4.73333 114.575 5.4C114.135 6.06667 113.409 6.57333 112.395 6.92L114.715 12.9H110.255L108.495 7.36H108.275L107.095 12.9H102.775L105.475 0.2H110.735C111.349 0.2 111.929 0.24 112.475 0.320001C113.022 0.386667 113.495 0.533334 113.895 0.76C114.309 0.973334 114.635 1.28 114.875 1.68C115.115 2.06667 115.235 2.58 115.235 3.22ZM109.475 6.08C109.822 6.08 110.115 5.96667 110.355 5.74C110.609 5.5 110.809 5.21333 110.955 4.88C111.115 4.54667 111.229 4.19333 111.295 3.82C111.362 3.43333 111.395 3.1 111.395 2.82C111.395 2.47333 111.335 2.18 111.215 1.94C111.095 1.68667 110.835 1.56 110.435 1.56H109.535L108.535 6.08H109.475Z" fill="#F4F4F4" />
    <Path d="M122.904 3.88C122.944 3.68 122.964 3.40667 122.964 3.06C122.964 2.86 122.95 2.66667 122.924 2.48C122.897 2.28 122.85 2.10667 122.784 1.96C122.717 1.8 122.617 1.68 122.484 1.6C122.35 1.50667 122.177 1.46 121.964 1.46C121.724 1.46 121.504 1.51333 121.304 1.62C121.104 1.72667 120.924 1.86667 120.764 2.04C120.617 2.2 120.497 2.39333 120.404 2.62C120.324 2.83333 120.284 3.06 120.284 3.3C120.284 3.64667 120.37 3.91333 120.544 4.1C120.73 4.28667 120.97 4.44 121.264 4.56C121.557 4.68 121.89 4.78 122.264 4.86C122.637 4.94 123.024 5.03333 123.424 5.14C123.757 5.23333 124.09 5.35333 124.424 5.5C124.757 5.64667 125.05 5.84667 125.304 6.1C125.57 6.34 125.784 6.66 125.944 7.06C126.104 7.44667 126.184 7.93333 126.184 8.52C126.184 9.36 126.017 10.0667 125.684 10.64C125.35 11.2133 124.89 11.68 124.304 12.04C123.717 12.4 123.017 12.66 122.204 12.82C121.404 12.98 120.53 13.06 119.584 13.06C118.624 13.06 117.837 13 117.224 12.88C116.624 12.7467 116.15 12.6067 115.804 12.46C115.39 12.2867 115.084 12.0867 114.884 11.86L115.564 9.12H119.084C119.07 9.24 119.057 9.40667 119.044 9.62C119.03 9.82 119.024 9.98 119.024 10.1C119.024 10.26 119.044 10.4267 119.084 10.6C119.124 10.7733 119.184 10.9333 119.264 11.08C119.357 11.2267 119.484 11.3467 119.644 11.44C119.804 11.5333 120.004 11.58 120.244 11.58C120.51 11.58 120.744 11.52 120.944 11.4C121.157 11.28 121.33 11.1333 121.464 10.96C121.61 10.7733 121.717 10.5733 121.784 10.36C121.864 10.1333 121.904 9.91333 121.904 9.7C121.904 9.40667 121.83 9.16 121.684 8.96C121.55 8.76 121.364 8.59333 121.124 8.46C120.884 8.31333 120.604 8.19333 120.284 8.1C119.977 7.99333 119.657 7.88667 119.324 7.78C119.004 7.68667 118.664 7.57333 118.304 7.44C117.957 7.30667 117.637 7.12 117.344 6.88C117.05 6.64 116.804 6.34 116.604 5.98C116.417 5.60667 116.324 5.13333 116.324 4.56C116.324 3.70667 116.537 2.99333 116.537 2.99333C116.537 2.99333 116.964 2.42 116.964 2.42C117.404 1.83333 117.95 1.36 118.604 1C119.27 0.64 119.997 0.386667 120.784 0.24C121.57 0.0800002 122.317 0 123.024 0C123.957 0 124.757 0.113333 125.424 0.34C126.104 0.553333 126.617 0.806667 126.964 1.1L126.224 3.88H122.904Z" fill="#F4F4F4" />
    <Path d="M138.339 1.72H135.119L132.739 12.9H128.419L130.799 1.72H127.619L127.979 0.2H138.679L138.339 1.72Z" fill="#F4F4F4" />
    <Path d="M142.184 8.36C142.118 8.65333 142.064 8.90667 142.024 9.12C141.984 9.33333 141.964 9.53333 141.964 9.72C141.964 10.1867 142.124 10.56 142.444 10.84C142.778 11.12 143.264 11.26 143.904 11.26C144.371 11.26 144.751 11.18 145.044 11.02C145.351 10.86 145.598 10.6467 145.784 10.38C145.984 10.1133 146.138 9.80667 146.244 9.46C146.364 9.11333 146.464 8.74667 146.544 8.36L148.244 0.2H150.064L148.324 8.4C148.191 9.04 147.998 9.64 147.744 10.2C147.491 10.76 147.124 11.2533 146.644 11.68C146.178 12.1067 145.571 12.4467 144.824 12.7C144.078 12.94 143.151 13.06 142.044 13.06C140.511 13.06 139.378 12.8133 138.644 12.32C137.911 11.8133 137.544 11.04 137.544 10C137.544 9.53333 137.604 8.94 137.724 8.22C137.844 7.5 137.998 6.72 138.184 5.88L139.404 0.2H143.944L142.184 8.36Z" fill="#F4F4F4" />
    <Path d="M149.034 12.9L151.734 0.2H157.114C157.941 0.2 158.661 0.286667 159.274 0.46C159.901 0.62 160.414 0.893334 160.814 1.28C161.227 1.66667 161.534 2.17333 161.734 2.8C161.947 3.42667 162.054 4.19333 162.054 5.1C162.054 6.07333 161.927 7.02667 161.674 7.96C161.434 8.89333 161.027 9.72667 160.454 10.46C159.881 11.1933 159.127 11.7867 158.194 12.24C157.274 12.68 156.134 12.9 154.774 12.9H149.034ZM154.514 11.5C154.954 11.5 155.341 11.32 155.674 10.96C156.021 10.5867 156.314 10.12 156.554 9.56C156.807 8.98667 157.014 8.36 157.174 7.68C157.347 6.98667 157.481 6.32 157.574 5.68C157.681 5.04 157.754 4.46667 157.794 3.96C157.847 3.45333 157.874 3.09333 157.874 2.88C157.874 2.46667 157.787 2.14667 157.614 1.92C157.454 1.68 157.167 1.56 156.754 1.56H155.794L153.654 11.5H154.514Z" fill="#F4F4F4" />
    <Path d="M166.188 12.9H161.868L164.568 0.2H168.908L166.188 12.9Z" fill="#F4F4F4" />
    <Path d="M176.204 0C177.35 0 178.277 0.146667 178.984 0.44C179.704 0.733334 180.27 1.18667 180.684 1.8C180.95 2.21333 181.157 2.68 181.304 3.2C181.45 3.72 181.524 4.32 181.524 5C181.524 5.58667 181.47 6.17333 181.364 6.76C181.257 7.34667 181.104 7.91333 180.904 8.46C180.717 8.99333 180.484 9.5 180.204 9.98C179.937 10.4467 179.637 10.86 179.304 11.22C178.677 11.9 177.95 12.38 177.124 12.66C176.31 12.9267 175.304 13.06 174.104 13.06C172.944 13.06 172.01 12.94 171.304 12.7C170.597 12.46 170.037 12.0733 169.624 11.54C169.33 11.1667 169.097 10.6933 168.924 10.12C168.764 9.54667 168.684 8.82667 168.684 7.96C168.684 6.48 168.944 5.16 169.464 4C169.997 2.82667 170.75 1.9 171.724 1.22C172.31 0.806667 172.964 0.5 173.684 0.3C174.404 0.0999999 175.244 0 176.204 0ZM173.944 11.66C174.25 11.66 174.537 11.5267 174.804 11.26C175.084 10.98 175.337 10.6133 175.564 10.16C175.804 9.69333 176.017 9.16667 176.204 8.58C176.404 7.99333 176.57 7.38667 176.704 6.76C176.837 6.13333 176.937 5.51333 177.004 4.9C177.084 4.27333 177.124 3.70667 177.124 3.2C177.124 2.50667 177.05 2.03333 176.904 1.78C176.77 1.51333 176.57 1.38 176.304 1.38C175.997 1.38 175.704 1.51333 175.424 1.78C175.144 2.04667 174.877 2.40667 174.624 2.86C174.384 3.3 174.164 3.81333 173.964 4.4C173.777 4.97333 173.61 5.56667 173.464 6.18C173.33 6.79333 173.224 7.4 173.144 8C173.077 8.6 173.044 9.15333 173.044 9.66C173.044 10.42 173.124 10.9467 173.284 11.24C173.457 11.52 173.677 11.66 173.944 11.66Z" fill="#F4F4F4" />
  </Svg>
);

const BiSolidUserCircleIcon = ({ color = "#F4F4F4", size = 16, opacity = 1 }: { color?: string, size?: number, opacity?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <Path d="M8.00016 1.33301C4.38616 1.33301 1.3335 4.38567 1.3335 7.99967C1.3335 11.6137 4.38616 14.6663 8.00016 14.6663C11.6142 14.6663 14.6668 11.6137 14.6668 7.99967C14.6668 4.38567 11.6142 1.33301 8.00016 1.33301ZM8.00016 4.66634C9.1515 4.66634 10.0002 5.51434 10.0002 6.66634C10.0002 7.81834 9.1515 8.66634 8.00016 8.66634C6.8495 8.66634 6.00016 7.81834 6.00016 6.66634C6.00016 5.51434 6.8495 4.66634 8.00016 4.66634ZM4.59616 11.181C5.19416 10.301 6.1915 9.71434 7.3335 9.71434H8.66683C9.8095 9.71434 10.8062 10.301 11.4042 11.181C10.5522 12.093 9.3435 12.6663 8.00016 12.6663C6.65683 12.6663 5.44816 12.093 4.59616 11.181Z" fill={color} fillOpacity={opacity} />
  </Svg>
);

const BiSolidUserCircle32Icon = ({ color = "#F4F4F4", size = 32, opacity = 1 }: { color?: string, size?: number, opacity?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <Circle cx="16" cy="16" r="13.33" stroke={color} strokeWidth={2} strokeOpacity={opacity} />
    <Circle cx="16" cy="12" r="4" fill={color} fillOpacity={opacity} />
    <Path d="M16 21.33C12.33 21.33 8.87 23.16 7.47 26.13C9.64 28.16 12.63 29.33 16 29.33C19.37 29.33 22.36 28.16 24.53 26.13C23.13 23.16 19.67 21.33 16 21.33Z" fill={color} fillOpacity={opacity} />
  </Svg>
);

const IoMdColorPaletteIcon = ({ color = "#F4F4F4", opacity = 1 }: { color?: string, opacity?: number }) => (
  <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
    <Path d="M8 2C4.70003 2 2 4.70003 2 8C2 11.3001 4.70003 14 8 14C8.56675 14 9 13.5667 9 13C9 12.7334 8.90006 12.5 8.73341 12.3333C8.56675 12.1667 8.46681 11.9333 8.46681 11.6667C8.46681 11.0999 8.90006 10.6667 9.46681 10.6667H10.6667C12.5 10.6667 14 9.16666 14 7.33334C14 4.40006 11.3001 2 8 2ZM4.33334 8C3.76659 8 3.33334 7.56675 3.33334 7C3.33334 6.43325 3.76659 6 4.33334 6C4.90006 6 5.33334 6.43325 5.33334 7C5.33334 7.56675 4.90006 8 4.33334 8ZM6.33334 5.33334C5.76659 5.33334 5.33333 4.90006 5.33334 4.33334C5.33334 3.76659 5.76659 3.33334 6.33334 3.33334C6.90006 3.33334 7.33334 3.76659 7.33334 4.33334C7.33334 4.90006 6.90006 5.33334 6.33334 5.33334ZM9.66666 5.33334C9.09994 5.33334 8.66666 4.90006 8.66666 4.33334C8.66666 3.76659 9.09994 3.33333 9.66666 3.33334C10.2334 3.33334 10.6667 3.76659 10.6667 4.33334C10.6667 4.90006 10.2334 5.33334 9.66666 5.33334ZM11.6667 8C11.0999 8 10.6667 7.56675 10.6667 7C10.6667 6.43325 11.0999 6 11.6667 6C12.2334 6 12.6667 6.43325 12.6667 7C12.6667 7.56675 12.2334 8 11.6667 8Z" fill={color} fillOpacity={opacity} />
  </Svg>
);

const BuildIcon = ({ color = "#F4F4F4", opacity = 1 }: { color?: string, opacity?: number }) => (
  <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
    <Path d="M14.3125 3.28125H5.875C5.59844 3.28125 5.375 3.50469 5.375 3.78125V7.46875H1.6875C1.41094 7.46875 1.1875 7.69219 1.1875 7.96875V12.2188C1.1875 12.4953 1.41094 12.7188 1.6875 12.7188H10.125C10.4016 12.7188 10.625 12.4953 10.625 12.2188V8.53325H14.3125C14.5891 8.53325 14.8125 8.30781 14.8125 8.03125V3.78125C14.8125 3.50469 14.5891 3.28125 14.3125 3.28125ZM9.5625 11.6562H6.4375V8.53125H9.5625V11.6562ZM13.75 7.46875H10.625V4.34375H13.75V7.46875Z" fill={color} fillOpacity={opacity} />
  </Svg>
);

const RiPaintFillIcon = ({ color = "#F4F4F4", opacity = 1 }: { color?: string, opacity?: number }) => (
  <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
    <Path d="M12.8185 12.4881L13.997 11.3096L15.1755 12.4881C15.8263 13.139 15.8263 14.1943 15.1755 14.8451C14.5246 15.496 13.4693 15.496 12.8185 14.8451C12.1676 14.1943 12.1676 13.139 12.8185 12.4881ZM5.91907 0.719727L13.4615 8.26219C13.7219 8.52252 13.7219 8.94465 13.4615 9.20499L7.80467 14.8619C7.54433 15.1222 7.1222 15.1222 6.86187 14.8619L1.20503 9.20499C0.944679 8.94465 0.944679 8.52252 1.20503 8.26219L6.39048 3.07675L4.97627 1.66254L5.91907 0.719727ZM7.33327 4.01956L2.61924 8.73359H12.0473L7.33327 4.01956Z" fill={color} fillOpacity={opacity} />
  </Svg>
);

const AiFillFireIcon = ({ color = "#F4F4F4", opacity = 1 }: { color?: string, opacity?: number }) => (
  <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
    <Path d="M13.0328 7.33143C12.7295 6.6487 12.2885 6.03592 11.7375 5.53143L11.2828 5.11424C11.2674 5.10046 11.2488 5.09069 11.2287 5.08577C11.2086 5.08085 11.1876 5.08094 11.1675 5.08603C11.1475 5.09112 11.129 5.10106 11.1137 5.11497C11.0984 5.12887 11.0867 5.14633 11.0797 5.1658L10.8766 5.74861C10.75 6.11424 10.5172 6.48768 10.1875 6.85486C10.1656 6.8783 10.1406 6.88455 10.1234 6.88611C10.1063 6.88768 10.0797 6.88455 10.0562 6.86268C10.0344 6.84393 10.0234 6.8158 10.025 6.78768C10.0828 5.84705 9.80156 4.78611 9.18594 3.63143C8.67656 2.67205 7.96875 1.92361 7.08437 1.40174L6.43906 1.02205C6.35469 0.972052 6.24688 1.03768 6.25156 1.13611L6.28594 1.88611C6.30937 2.39861 6.25 2.85174 6.10938 3.2283C5.9375 3.68924 5.69063 4.11736 5.375 4.50174C5.15535 4.76887 4.90639 5.01049 4.63281 5.22205C3.97391 5.72856 3.43815 6.37757 3.06562 7.12049C2.69402 7.86989 2.50045 8.69496 2.5 9.53143C2.5 10.2689 2.64531 10.983 2.93281 11.6564C3.21042 12.3048 3.61103 12.8933 4.1125 13.3892C4.61875 13.8892 5.20625 14.283 5.86094 14.5564C6.53906 14.8408 7.25781 14.9846 8 14.9846C8.74219 14.9846 9.46094 14.8408 10.1391 14.558C10.7921 14.2862 11.386 13.8897 11.8875 13.3908C12.3937 12.8908 12.7906 12.3064 13.0672 11.658C13.3543 10.9864 13.5015 10.2634 13.5 9.53299C13.5 8.77049 13.3437 8.02986 13.0328 7.33143Z" fill={color} fillOpacity={opacity} />
  </Svg>
);

const DrawIcon = ({ color = "#1D1D1D" }: { color?: string }) => (
  <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
    <Path d="M12.5667 6.92667L13.2733 6.22C13.7933 5.7 13.7933 4.85333 13.2733 4.33333L12.3333 3.39333C11.8133 2.87333 10.9667 2.87333 10.4467 3.39333L9.74 4.1L12.5667 6.92667ZM8.79333 5.04L2.66667 11.1733V14H5.49333L11.62 7.87333L8.79333 5.04ZM12.6667 11.6667C12.6667 13.1267 10.9733 14 9.33333 14C8.96667 14 8.66667 13.7 8.66667 13.3333C8.66667 12.9667 8.96667 12.6667 9.33333 12.6667C10.36 12.6667 11.3333 12.18 11.3333 11.6667C11.3333 11.3533 11.0133 11.0867 10.5133 10.8667L11.5 9.88C12.2133 10.3 12.6667 10.86 12.6667 11.6667ZM3.05333 8.9C2.40667 8.52667 2 8.04 2 7.33333C2 6.13333 3.26 5.58 4.37333 5.09333C5.06 4.78667 6 4.37333 6 4C6 3.72667 5.48 3.33333 4.66667 3.33333C3.82667 3.33333 3.46667 3.74 3.44667 3.76C3.21333 4.03333 2.79333 4.06667 2.51333 3.84C2.37965 3.7302 2.29431 3.57239 2.27561 3.4004C2.25692 3.22842 2.30636 3.05596 2.41333 2.92C2.48667 2.82667 3.17333 2 4.66667 2C6.16 2 7.33333 2.88 7.33333 4C7.33333 5.24667 6.04667 5.81333 4.90667 6.31333C4.28 6.58667 3.33333 7 3.33333 7.33333C3.33333 7.54 3.62 7.73333 4.04667 7.90667L3.05333 8.9Z" fill={color} />
  </Svg>
);

const SculptIcon = ({ color = "#F4F4F4" }: { color?: string }) => (
  <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
    <Path d="M11.836 9.33294C12.6414 9.33294 13.2985 9.96801 13.3338 10.7647L13.3332 10.833L8.00231 10.8329V11.499L13.3191 11.4998C13.2786 11.8542 13.1627 12.1953 12.98 12.5005L8.00231 12.499V13.1663L12.428 13.167C11.3874 14.1709 9.9015 14.6671 7.99991 14.6671C5.90268 14.6671 4.31201 14.0636 3.2678 12.8408C2.88129 12.3881 2.66895 11.8125 2.66895 11.2173V10.8322C2.66895 10.0042 3.34019 9.33294 4.1682 9.33294H11.836ZM7.99991 1.33301C9.09044 1.33301 10.0586 1.85665 10.6667 2.66621L8.0019 2.66634L8.00164 3.33234L11.056 3.33331C11.192 3.6447 11.2818 3.98089 11.3168 4.33321L8.00164 4.33234V4.99901L11.3168 5.00014C11.2817 5.35247 11.1918 5.68865 11.0557 6.00003L8.00164 5.99901L8.0019 6.66634L10.6662 6.66714C10.058 7.47634 9.09011 7.99967 7.99991 7.99967C6.15897 7.99967 4.66659 6.50729 4.66659 4.66634C4.66659 2.82539 6.15897 1.33301 7.99991 1.33301Z" fill={color} />
  </Svg>
);

const CameraLensIcon = ({ color = "#F4F4F4" }: { color?: string }) => (
  <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
    <Path d="M6.55167 14.5085L9.53976 9.33301L11.8944 13.4113C10.7988 14.2011 9.45383 14.6663 8.00016 14.6663C7.5027 14.6663 7.01803 14.6119 6.55167 14.5085ZM5.26006 14.079C3.54116 13.303 2.21027 11.8195 1.6387 9.99967H7.61523L5.26006 14.079ZM1.36642 8.66634C1.34464 8.44707 1.3335 8.22467 1.3335 7.99967C1.3335 6.26157 1.99865 4.67881 3.0883 3.49207L6.07566 8.66634H1.36642ZM4.10594 2.58801C5.20148 1.79827 6.54649 1.33301 8.00016 1.33301C8.49763 1.33301 8.9823 1.38749 9.44863 1.49081L6.46056 6.66634L4.10594 2.58801ZM10.7402 1.92035C12.4592 2.69631 13.79 4.17986 14.3616 5.99967H8.3851L10.7402 1.92035ZM14.6339 7.33301C14.6557 7.55227 14.6668 7.77467 14.6668 7.99967C14.6668 9.73781 14.0017 11.3205 12.912 12.5073L9.9247 7.33301H14.6339Z" fill={color} />
  </Svg>
);

const MagicWandIcon = ({ color = "#F4F4F4" }: { color?: string }) => (
  <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
    <Path d="M7.33321 2.66667L6.99988 2L6.66655 2.66667L5.99988 2.75L6.55588 3.222L6.33321 4L6.99988 3.556L7.66655 4L7.44388 3.222L7.99988 2.75L7.33321 2.66667ZM12.8892 9.77733L12.3332 8.66667L11.7772 9.77733L10.6665 9.91667L11.5925 10.704L11.2225 12L12.3332 11.2593L13.4439 12L13.0739 10.704L13.9999 9.91667L12.8892 9.77733ZM4.44455 4.222L3.99988 3.33333L3.55521 4.222L2.66655 4.33333L3.40721 4.96267L3.11121 6L3.99988 5.40733L4.88855 6L4.59255 4.96267L5.33321 4.33321L4.44455 4.222ZM2.27588 11.3333C2.27588 11.6893 2.41455 12.024 2.66655 12.276L3.72388 13.3333C3.97588 13.5853 4.31055 13.724 4.66655 13.724C5.02255 13.724 5.35721 13.5853 5.60921 13.3333L13.3332 5.60933C13.5852 5.35733 13.7239 5.02267 13.7239 4.66667C13.7239 4.31067 13.5852 3.976 13.3332 3.724L12.2759 2.66667C11.7719 2.16267 10.8945 2.16267 10.3905 2.66667L2.66655 10.3907C2.41455 10.6427 2.27588 10.9773 2.27588 11.3333ZM11.3332 3.60933L12.3905 4.66667L9.99988 7.05733L8.94255 6L11.3332 3.60933Z" fill={color} />
  </Svg>
);

const PhotoCameraIcon = ({ color = "#F4F4F4" }: { color?: string }) => (
  <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
    <Path d="M8.00003 10.1329C9.17824 10.1329 10.1334 9.17775 10.1334 7.99954C10.1334 6.82134 9.17824 5.86621 8.00003 5.86621C6.82182 5.86621 5.8667 6.82134 5.8667 7.99954C5.8667 9.17775 6.82182 10.1329 8.00003 10.1329Z" fill={color} />
    <Path d="M6.00016 1.33301L4.78016 2.66634H2.66683C1.9335 2.66634 1.3335 3.26634 1.3335 3.99967V11.9997C1.3335 12.733 1.9335 13.333 2.66683 13.333H13.3335C14.0668 13.333 14.6668 12.733 14.6668 11.9997V3.99967C14.6668 3.26634 14.0668 2.66634 13.3335 2.66634H11.2202L10.0002 1.33301H6.00016ZM8.00016 11.333C6.16016 11.333 4.66683 9.83967 4.66683 7.99967C4.66683 6.15967 6.16016 4.66634 8.00016 4.66634C9.84016 4.66634 11.3335 6.15967 11.3335 7.99967C11.3335 9.83967 9.84016 11.333 8.00016 11.333Z" fill={color} />
  </Svg>
);

const PhotoLibraryIcon = ({ color = "#F4F4F4" }: { color?: string }) => (
  <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
    <Path d="M14.6668 10.6663V2.66634C14.6668 1.93301 14.0668 1.33301 13.3335 1.33301H5.3335C4.60016 1.33301 4.00016 1.93301 4.00016 2.66634V10.6663C4.00016 11.3997 4.60016 11.9997 5.3335 11.9997H13.3335C14.0668 11.9997 14.6668 11.3997 14.6668 10.6663ZM7.3335 7.99967L8.68683 9.80634L10.6668 7.33301L13.3335 10.6663H5.3335L7.3335 7.99967ZM1.3335 3.99967V13.333C1.3335 14.0663 1.9335 14.6663 2.66683 14.6663H12.0002V13.333H2.66683V3.99967H1.3335Z" fill={color} />
  </Svg>
);

const TbProgressCheckIcon = ({ color = "#F4F4F4" }: { color?: string }) => (
  <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
    <Path d="M6.66652 13.8511C6.08626 13.7195 5.52897 13.5017 5.01318 13.2051" stroke={color} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M9.3335 2.14844C10.6589 2.45115 11.8423 3.1949 12.6899 4.25791C13.5375 5.32092 13.9991 6.64021 13.9991 7.99977C13.9991 9.35934 13.5375 10.6786 12.6899 11.7416C11.8423 12.8046 10.6589 13.5484 9.3335 13.8511" stroke={color} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M3.05286 11.395C2.6892 10.8666 2.413 10.2832 2.23486 9.66699" stroke={color} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M2.08252 7.00034C2.18919 6.36701 2.39452 5.76701 2.68252 5.21701L2.79519 5.01367" stroke={color} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M4.60449 3.05244C5.22826 2.62304 5.92804 2.31625 6.66649 2.14844" stroke={color} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M6 8.00033L7.33333 9.33366L10 6.66699" stroke={color} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const SpinnerIcon = ({ color = "#FFFFFF" }: { color?: string }) => {
  const spinValue = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.loop(
      Animated.timing(spinValue, {
        toValue: 1,
        duration: 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, [spinValue]);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View style={{ transform: [{ rotate: spin }] }}>
      <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
        <Path opacity="0.2" fillRule="evenodd" clipRule="evenodd" d="M8.00016 12.6663C10.5775 12.6663 12.6668 10.577 12.6668 7.99967C12.6668 5.42235 10.5775 3.33301 8.00016 3.33301C5.42284 3.33301 3.3335 5.42235 3.3335 7.99967C3.3335 10.577 5.42284 12.6663 8.00016 12.6663ZM8.00016 14.6663C11.682 14.6663 14.6668 11.6815 14.6668 7.99967C14.6668 4.31777 11.682 1.33301 8.00016 1.33301C4.31826 1.33301 1.3335 4.31777 1.3335 7.99967C1.3335 11.6815 4.31826 14.6663 8.00016 14.6663Z" fill={color} />
        <Path d="M1.3335 7.99967C1.3335 4.31777 4.31826 1.33301 8.00016 1.33301V3.33301C5.42284 3.33301 3.3335 5.42235 3.3335 7.99967H1.3335Z" fill={color} />
      </Svg>
    </Animated.View>
  );
};

const CloseIcon = ({ color = "#FFFFFF" }: { color?: string }) => (
  <Svg width={12} height={12} viewBox="0 0 12 12" fill="none">
    <Path d="M9 3L3 9M3 3L9 9" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

// --- Figma Component Icons ---

const ShareIcon = ({ color = "#F4F4F4" }: { color?: string }) => (
  <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
    <Path d="M8.74696 11.3482L5.94769 9.82127C5.46106 10.3413 4.76857 10.6663 4.00016 10.6663C2.5274 10.6663 1.3335 9.47241 1.3335 7.99967C1.3335 6.52691 2.5274 5.33301 4.00016 5.33301C4.76853 5.33301 5.461 5.65798 5.94762 6.17798L8.74696 4.65109C8.69463 4.44261 8.66683 4.22439 8.66683 3.99967C8.66683 2.52691 9.86076 1.33301 11.3335 1.33301C12.8062 1.33301 14.0002 2.52691 14.0002 3.99967C14.0002 5.47243 12.8062 6.66634 11.3335 6.66634C10.5651 6.66634 9.87263 6.34135 9.38596 5.82131L6.58668 7.34821C6.63903 7.55667 6.66683 7.77494 6.66683 7.99967C6.66683 8.22441 6.63904 8.44261 6.5867 8.65107L9.38603 10.178C9.87263 9.65801 10.5651 9.33301 11.3335 9.33301C12.8062 9.33301 14.0002 10.5269 14.0002 11.9997C14.0002 13.4724 12.8062 14.6663 11.3335 14.6663C9.86076 14.6663 8.66683 13.4724 8.66683 11.9997C8.66683 11.7749 8.69463 11.5567 8.74696 11.3482ZM4.00016 9.33301C4.73654 9.33301 5.3335 8.73607 5.3335 7.99967C5.3335 7.26327 4.73654 6.66634 4.00016 6.66634C3.26378 6.66634 2.66683 7.26327 2.66683 7.99967C2.66683 8.73607 3.26378 9.33301 4.00016 9.33301ZM11.3335 5.33301C12.0699 5.33301 12.6668 4.73605 12.6668 3.99967C12.6668 3.26329 12.0699 2.66634 11.3335 2.66634C10.5971 2.66634 10.0002 3.26329 10.0002 3.99967C10.0002 4.73605 10.5971 5.33301 11.3335 5.33301ZM11.3335 13.333C12.0699 13.333 12.6668 12.7361 12.6668 11.9997C12.6668 11.2633 12.0699 10.6663 11.3335 10.6663C10.5971 10.6663 10.0002 11.2633 10.0002 11.9997C10.0002 12.7361 10.5971 13.333 11.3335 13.333Z" fill={color} />
  </Svg>
);

const ToSourceIcon = ({ color = "#1D1D1D" }: { color?: string }) => (
  <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
    <Path d="M7.0286 1.19526C7.28893 0.934913 7.71107 0.934913 7.9714 1.19526L9.638 2.86185C9.763 2.98687 9.83327 3.15644 9.83327 3.33325C9.83327 3.51006 9.763 3.67963 9.638 3.80465L7.9714 5.47124C7.71107 5.73159 7.28893 5.73159 7.0286 5.47124C6.76827 5.21089 6.76827 4.78878 7.0286 4.52843L7.53407 4.02297C5.17549 4.25677 3.33333 6.24659 3.33333 8.66667C3.33333 11.244 5.42267 13.3333 8 13.3333C10.3793 13.3333 12.3435 11.5522 12.6305 9.25087C12.6761 8.88547 13.0092 8.6262 13.3745 8.6718C13.7399 8.71733 13.9992 9.05047 13.9536 9.4158C13.5845 12.3763 11.0602 14.6667 8 14.6667C4.68629 14.6667 2 11.9804 2 8.66667C2 5.49679 4.45815 2.90105 7.5722 2.68168L7.0286 2.13807C6.76827 1.87772 6.76827 1.45561 7.0286 1.19526ZM10.8047 6.52859C11.0651 6.78893 11.0651 7.21107 10.8047 7.4714L7.80473 10.4714C7.5444 10.7317 7.12227 10.7317 6.86193 10.4714L5.52859 9.13807C5.26825 8.87773 5.26825 8.4556 5.52859 8.19527C5.78895 7.93493 6.21105 7.93493 6.47141 8.19527L7.33333 9.0572L9.86193 6.52859C10.1223 6.26825 10.5444 6.26825 10.8047 6.52859Z" fill={color} />
  </Svg>
);

const MdFileDownloadIcon = ({ color = "#F4F4F4" }: { color?: string }) => (
  <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
    <Path d="M12.6668 6H10.0002V2H6.00016V6H3.3335L8.00016 10.6667L12.6668 6ZM3.3335 12V13.3333H12.6668V12H3.3335Z" fill={color} />
  </Svg>
);

// --- Figma Component: Toggle-button ---
const ToggleButton = ({ value, onToggle }: { value: boolean, onToggle: () => void }) => (
  <TouchableOpacity
    onPress={onToggle}
    style={[styles.toggleContainer, value ? styles.toggleOn : styles.toggleOff]}
    activeOpacity={0.8}
  >
    <View style={[styles.toggleCircle, value ? styles.toggleCircleActive : styles.toggleCircleInactive]} />
  </TouchableOpacity>
);

// --- Figma Components ---

const MainNavTab = ({ activeTab, onTabChange }: { activeTab: ToolMode; onTabChange: (tab: ToolMode) => void }) => (
  <View style={styles.navTabContainer}>
    <TouchableOpacity
      onPress={() => onTabChange('designer')}
      style={[styles.tabButton, activeTab === 'designer' && styles.tabButtonActive]}
      activeOpacity={0.8}
    >
      <DrawIcon color={activeTab === 'designer' ? '#FFFFFF' : 'rgba(244, 244, 244, 0.4)'} />
      <Text style={[styles.tabButtonText, activeTab === 'designer' ? styles.tabTextActive : styles.tabTextInactive]}>DESIGN</Text>
    </TouchableOpacity>

    <TouchableOpacity
      onPress={() => onTabChange('painter')}
      style={[styles.tabButton, activeTab === 'painter' && styles.tabButtonActive]}
      activeOpacity={0.8}
    >
      <RiPaintFillIcon color={activeTab === 'painter' ? '#FFFFFF' : 'rgba(244, 244, 244, 0.4)'} />
      <Text style={[styles.tabButtonText, activeTab === 'painter' ? styles.tabTextActive : styles.tabTextInactive]}>PAINT</Text>
    </TouchableOpacity>
  </View>
);

const ConceptNavTab = ({ activeType, onTypeChange }: { activeType: DesignerType; onTypeChange: (type: DesignerType) => void }) => {
  const tabs: { id: DesignerType; label: string; Icon: any }[] = [
    { id: 'sketch', label: 'Sketch', Icon: DrawIcon },
    { id: 'miniature', label: 'Sculpt', Icon: SculptIcon },
    { id: 'pro-shot', label: 'Photoshoot', Icon: CameraLensIcon }
  ];

  return (
    <View style={styles.conceptTabContainer}>
      {tabs.map((tab) => (
        <TouchableOpacity
          key={tab.id}
          onPress={() => onTypeChange(tab.id)}
          style={[styles.conceptTabButton, activeType === tab.id && styles.conceptTabButtonActive]}
          activeOpacity={0.8}
        >
          <tab.Icon color={activeType === tab.id ? '#1D1D1D' : '#F4F4F4'} />
          <Text style={[styles.conceptTabText, activeType === tab.id ? styles.conceptTabTextActive : styles.conceptTabTextInactive]}>
            {tab.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const ProBadge = ({ isPro, onToggle }: { isPro: boolean; onToggle: () => void }) => (
  <TouchableOpacity
    onPress={onToggle}
    style={[styles.proBadge, isPro ? styles.proBadgeActive : styles.proBadgeInactive]}
    activeOpacity={0.7}
  >
    <TbProgressCheckIcon color="#F4F4F4" />
    <Text style={[styles.proBadgeText, styles.proTextInactive]}>Pro</Text>
  </TouchableOpacity>
);

export default function StudioScreen() {
  const { loading: authLoading } = useAuth();
  const insets = useSafeAreaInsets();

  const { styles: paintStylesList, templates: designerTemplates, effects: effectPrompts, shareMessage, exampleAssets, loading: promptsLoading } = usePrompts();

  const [activeTab, setActiveTab] = useState<ToolMode>('designer');
  const [designerType, setDesignerType] = useState<DesignerType>('sketch');
  const [selectedStyle, setSelectedStyle] = useState<StyleOption>(paintStylesList[0]);
  useEffect(() => {
    if (paintStylesList.length > 0 && !selectedStyle) {
      setSelectedStyle(paintStylesList[0]);
    }
  }, [paintStylesList]);
  const [isNMMEnabled, setIsNMMEnabled] = useState(false);
  const [isOSLEnabled, setIsOSLEnabled] = useState(false);
  const [isPaletteEnabled, setIsPaletteEnabled] = useState(false);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);

  const [designerPrompt, setDesignerPrompt] = useState('');
  const [painterPrompt, setPainterPrompt] = useState('');
  const [isPro, setIsPro] = useState(false);

  const [sourceImages, setSourceImages] = useState<ImageFile[]>([]);
  const [activePreviewImage, setActivePreviewImage] = useState<string | null>(null);
  const [generationHistory, setGenerationHistory] = useState<HistoryItem[]>([]);
  const [selectedColors, setSelectedColors] = useState<{ name: string, hex: string }[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [isUpscaling, setIsUpscaling] = useState(false);
  const [isResultsDrawerOpen, setIsResultsDrawerOpen] = useState(false);
  const [isPaintExplorerOpen, setIsPaintExplorerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { pickMultipleImages } = useImagePicker();
  const { saveImage } = useMediaSave();

  // Load example assets when available
  useEffect(() => {
    if (exampleAssets && exampleAssets.length > 0) {
      // Avoid duplicates if already loaded
      setSourceImages(prev => {
        // Convert exampleAssets (strings) to ImageFile objects
        const exampleImageFiles: ImageFile[] = exampleAssets.map(url => ({
          base64: url,
          mimeType: 'image/png', // Assuming example assets are PNGs, adjust if needed
        }));

        // Filter out duplicates based on base64 content
        const newImages = exampleImageFiles.filter(
          newImg => !prev.some(existingImg => existingImg.base64 === newImg.base64)
        );

        if (newImages.length === 0) return prev;
        return [...prev, ...newImages];
      });
    }
  }, [exampleAssets]);

  const handlePickImage = useCallback(async () => {
    const images = await pickMultipleImages();
    if (images.length > 0) {
      setSourceImages(prev => [...prev, ...images]);
    }
  }, [pickMultipleImages]);

  const handleGenerate = useCallback(async () => {
    if (sourceImages.length === 0) {
      setError("Please add reference images first.");
      return;
    }
    setIsLoading(true);
    setError(null);
    const model = isPro ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image';
    try {
      let images: string[] = [];
      if (activeTab === 'painter' && sourceImages.length >= 1) {
        const promptToUse = isPro ? (selectedStyle.promptPro || selectedStyle.prompt) : selectedStyle.prompt;
        const promptParts: string[] = [promptToUse, painterPrompt];

        const nmmEffect = effectPrompts['effect.nmm'];
        if (isNMMEnabled && nmmEffect) promptParts.push(isPro ? nmmEffect.pro : nmmEffect.default);

        const oslEffect = effectPrompts['effect.osl'];
        if (isOSLEnabled && oslEffect) promptParts.push(isPro ? oslEffect.pro : oslEffect.default);
        if (isPaletteEnabled) {
          if (selectedColors.length > 0) {
            promptParts.push(`strictly using this color palette: ${selectedColors.map(c => `${c.name} (${c.hex})`).join(', ')}`);
          } else if (selectedBrands.length > 0) {
            promptParts.push(`using paints from these brands: ${selectedBrands.join(', ')}`);
          }
        }
        promptParts.push("GENERATE THE IMAGE NOW. Do not output conversational text.");
        const finalPrompt = promptParts.filter(Boolean).join(' ');
        images = await generatePaintedMiniature(sourceImages, finalPrompt, 1, model);
      } else if (activeTab === 'designer') {
        const characterDesc = designerPrompt.trim() || 'character';
        const typeToUse = sourceImages.length > 1 ? 'combined' : designerType;
        const templateConfig = designerTemplates[typeToUse];
        const template = isPro ? templateConfig.pro : templateConfig.default;
        const prompt = template.replace(/{input}/g, characterDesc);
        images = await generateImageFromImage(sourceImages, prompt, model);
      }
      if (images && images.length > 0) {
        const resultUrl = images[0];
        setActivePreviewImage(resultUrl);
        setGenerationHistory(prev => [{ url: resultUrl, isPro, isMaster: false, modelName: model, timestamp: Date.now() }, ...prev]);
        setIsResultsDrawerOpen(true);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') setError(err.message || "An unknown error occurred.");
    } finally {
      setIsLoading(false);
    }
  }, [sourceImages, activeTab, designerPrompt, designerType, isPro, painterPrompt, selectedStyle, isNMMEnabled, isOSLEnabled, isPaletteEnabled, selectedColors, selectedBrands]);

  const handleCancelGeneration = useCallback(() => {
    cancelGeneration();
    setIsLoading(false);
  }, []);

  const handleUpscale = useCallback(async () => {
    if (!activePreviewImage) return;
    setIsUpscaling(true);
    const model = isPro ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image';
    try {
      const upscaled = await upscaleImage({ base64: activePreviewImage, mimeType: 'image/png' }, model);
      setActivePreviewImage(upscaled);
      setGenerationHistory(prev => prev.map(item => item.url === activePreviewImage ? { ...item, url: upscaled, isMaster: true } : item));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsUpscaling(false);
    }
  }, [activePreviewImage, isPro]);

  const handleDownload = useCallback(async () => {
    if (!activePreviewImage) return;
    const success = await saveImage(activePreviewImage);
    if (success) Alert.alert('Success', 'Image saved to your photo library!');
  }, [activePreviewImage, saveImage]);

  const handleShare = useCallback(async () => {
    if (!activePreviewImage) return;
    try {
      // Check if sharing is available
      const isAvailable = await isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Error', 'Sharing is not available on this device');
        return;
      }

      // Generate a temporary file path
      const filename = `ministudio_share_${Date.now()}.png`;
      const fileUri = FileSystem.cacheDirectory + filename;

      // The base64 data usually comes with prefix "data:image/png;base64,", strip it if needed for writeAsStringAsync
      // But passing base64 directly to writeAsStringAsync with encoding base64 expects pure base64.
      // activePreviewImage includes "data:image/png;base64," prefix.
      const base64Data = activePreviewImage.split(',')[1];

      await FileSystem.writeAsStringAsync(fileUri, base64Data, {
        encoding: 'base64',
      });

      if (Platform.OS === 'ios') {
        await Share.share({
          url: fileUri,
          message: shareMessage,
        });
      } else {
        await shareAsync(fileUri, {
          mimeType: 'image/png',
          dialogTitle: 'Share your Miniature',
          UTI: 'public.png',
        });
      }
    } catch (error: any) {
      Alert.alert('Error sharing', error.message);
    }
  }, [activePreviewImage]);

  const handleUseAsSource = useCallback(() => {
    if (!activePreviewImage) return;
    const newImage: ImageFile = { base64: activePreviewImage, mimeType: 'image/png' };
    setSourceImages([newImage]);
    setIsResultsDrawerOpen(false);
  }, [activePreviewImage]);

  const toggleColor = (colorName: string, hexCode?: string) => {
    setSelectedColors(prev => {
      const exists = prev.find(c => c.name === colorName);
      if (exists) {
        return prev.filter(c => c.name !== colorName);
      } else {
        return [...prev, { name: colorName, hex: hexCode || '#FFFFFF' }];
      }
    });
  };

  const toggleBrand = (brand: string) => {
    setSelectedBrands(prev => {
      if (prev.includes(brand)) {
        return prev.filter(b => b !== brand);
      } else {
        return [...prev, brand];
      }
    });
  };

  if (authLoading) return <View style={styles.centered}><ActivityIndicator size="large" color="#0058DB" /></View>;

  const hasImageLoaded = sourceImages.length > 0;
  const hasContentToView = hasImageLoaded || generationHistory.length > 0;

  // paintStylesList is now coming from the hook

  const brandTabs = ['My Paints', 'Army Painter', 'Citadel Colour', 'Scale75', 'Duncan', 'Vallejo'];



  return (
    <View style={styles.screenContainer}>
      <View style={[styles.statusBarBackground, { height: insets.top }]} />
      <StatusBar barStyle="light-content" backgroundColor="#12121F" />
      <View style={styles.container}>

        {/* Top Navigation */}
        <View style={styles.topNav}>
          <View style={styles.topNavSide}>
            <ProBadge isPro={isPro} onToggle={() => setIsPro(!isPro)} />
          </View>
          <View style={styles.topNavTitle}>
            <AppTitleIcon />
          </View>
          <TouchableOpacity onPress={() => router.push('/settings')} style={[styles.topNavSide, styles.userIconContainer]} activeOpacity={0.7}>
            <BiSolidUserCircle32Icon />
          </TouchableOpacity>
        </View>

        {/* Main Content Area */}
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <MainNavTab activeTab={activeTab} onTabChange={setActiveTab} />

          {/* Input Container */}
          <View style={styles.inputContainer}>
            <View style={styles.sourceInfo}>
              <Text style={styles.inputLabel}>SOURCE</Text>
              <Text style={styles.inputSubtitle}>
                {hasImageLoaded ? 'Image to Image' : 'Choose an image'}
              </Text>
            </View>

            {hasImageLoaded ? (
              <View style={styles.sourceImageWrapper}>
                <Image source={{ uri: sourceImages[0].base64 }} style={styles.sourceImage} />
                <TouchableOpacity onPress={() => setSourceImages([])} style={styles.removeImageOverlay}>
                  <Text style={styles.removeImageTextSmall}>×</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.optionsRow}>
                <TouchableOpacity style={styles.optionButton} onPress={() => router.push('/camera')} activeOpacity={0.8}>
                  <PhotoCameraIcon />
                  <Text style={styles.optionButtonText}>Photo</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.optionButton} onPress={handlePickImage} activeOpacity={0.8}>
                  <PhotoLibraryIcon />
                  <Text style={styles.optionButtonText}>Files</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Mode-Specific Content */}
          {hasImageLoaded && (
            <View style={styles.modeContent}>
              {activeTab === 'designer' ? (
                <>
                  <View style={styles.designStepSection}>
                    <View style={styles.sectionHeader}>
                      <BuildIcon color="rgba(244, 244, 244, 0.4)" />
                      <Text style={styles.sectionHeaderText}>DESIGN STEP</Text>
                    </View>
                    <ConceptNavTab activeType={designerType} onTypeChange={setDesignerType} />
                  </View>
                  <View style={styles.promptContainer}>
                    <TextInput
                      value={designerPrompt}
                      onChangeText={setDesignerPrompt}
                      placeholder="Add more details to the default prompt..."
                      placeholderTextColor="rgba(244, 244, 244, 0.4)"
                      multiline
                      textAlignVertical="top"
                      style={styles.promptInput}
                    />
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.paintStepSection}>
                    <View style={styles.sectionHeader}>
                      <RiPaintFillIcon color="rgba(244, 244, 244, 0.4)" />
                      <Text style={styles.sectionHeaderText}>CHOOSE A STYLE</Text>
                    </View>
                    <View style={styles.styleGrid}>
                      {paintStylesList.map((style) => (
                        <TouchableOpacity
                          key={style.id}
                          onPress={() => setSelectedStyle(paintStylesList.find(s => s.id === style.id) || paintStylesList[0])}
                          style={[styles.styleButton, selectedStyle?.id === style.id && styles.styleButtonActive]}
                        >
                          <Text style={[styles.styleButtonText, selectedStyle?.id === style.id ? styles.styleTextActive : styles.styleTextInactive]}>
                            {style.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  <View style={styles.promptContainer}>
                    <TextInput
                      value={painterPrompt}
                      onChangeText={setPainterPrompt}
                      placeholder="Add more details to the default prompt..."
                      placeholderTextColor="rgba(244, 244, 244, 0.4)"
                      multiline
                      textAlignVertical="top"
                      style={styles.promptInput}
                    />
                  </View>

                  <View style={styles.paintStepSection}>
                    <View style={styles.sectionHeader}>
                      <MagicWandIcon color="rgba(244, 244, 244, 0.4)" />
                      <Text style={styles.sectionHeaderText}>ADD EFFECTS</Text>
                    </View>
                    <TouchableOpacity style={styles.optionItem} onPress={() => setIsNMMEnabled(!isNMMEnabled)} activeOpacity={0.7}>
                      <Text style={[styles.optionLabel, isNMMEnabled && styles.optionLabelActive]}>NNM - Non Metallic Metal</Text>
                      <ToggleButton value={isNMMEnabled} onToggle={() => setIsNMMEnabled(!isNMMEnabled)} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.optionItem} onPress={() => setIsOSLEnabled(!isOSLEnabled)} activeOpacity={0.7}>
                      <Text style={[styles.optionLabel, isOSLEnabled && styles.optionLabelActive]}>OSL - Object Source Lighting</Text>
                      <ToggleButton value={isOSLEnabled} onToggle={() => setIsOSLEnabled(!isOSLEnabled)} />
                    </TouchableOpacity>

                    <View style={styles.sectionHeader}>
                      <IoMdColorPaletteIcon color="rgba(244, 244, 244, 0.4)" />
                      <Text style={styles.sectionHeaderText}>COLOR PALETTE</Text>
                    </View>
                    <TouchableOpacity style={styles.optionItem} onPress={() => setIsPaletteEnabled(!isPaletteEnabled)} activeOpacity={0.7}>
                      <Text style={[styles.optionLabel, isPaletteEnabled && styles.optionLabelActive]}>Choose from Brands and Paints</Text>
                      <ToggleButton value={isPaletteEnabled} onToggle={() => setIsPaletteEnabled(!isPaletteEnabled)} />
                    </TouchableOpacity>

                    {isPaletteEnabled && (
                      <>
                        {/* Brand Selection Tabs */}
                        <View style={styles.brandTabs}>
                          {brandTabs.map((brand) => {
                            const isSelected = selectedBrands.includes(brand);
                            return (
                              <TouchableOpacity
                                key={brand}
                                onPress={() => toggleBrand(brand)}
                                style={[styles.brandButton, isSelected && styles.brandButtonActive]}
                              >
                                {brand === 'My Paints' && <BiSolidUserCircleIcon size={16} color={isSelected ? '#1D1D1D' : '#F4F4F4'} opacity={1} />}
                                <Text style={[styles.brandText, isSelected ? styles.styleTextActive : styles.styleTextInactive]}>{brand}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>

                        {/* Paint Selection Container */}
                        <View style={styles.paintSelectionContainer}>
                          {selectedColors.length > 0 ? (
                            <>
                              {/* Header with count and clear */}
                              <View style={styles.paintSelectionHeader}>
                                <Text style={styles.paintSelectionCount}>{selectedColors.length} Colors Selected</Text>
                                <TouchableOpacity onPress={() => setSelectedColors([])}>
                                  <Text style={styles.clearAllText}>Clear All</Text>
                                </TouchableOpacity>
                              </View>
                              {/* Color chips */}
                              <View style={styles.colorChipsGrid}>
                                {selectedColors.map((color) => (
                                  <View key={color.name} style={styles.colorChip}>
                                    <View style={[styles.colorChipCircle, { backgroundColor: color.hex }]} />
                                    <Text style={styles.colorChipName} numberOfLines={1}>{color.name}</Text>
                                    <TouchableOpacity onPress={() => toggleColor(color.name)} style={styles.colorChipClose}>
                                      <CloseIcon color="#F4F4F4" />
                                    </TouchableOpacity>
                                  </View>
                                ))}
                              </View>
                            </>
                          ) : (
                            <View style={styles.paintSelectionEmpty}>
                              <Text style={styles.paintSelectionHint}>
                                {selectedBrands.length > 0
                                  ? `${selectedBrands.length} ${selectedBrands.length === 1 ? 'Brand' : 'Brands'} Selected`
                                  : 'When no specific Brand or Paint is selected, the AI can use any of them to create.'}
                              </Text>
                            </View>
                          )}
                          {/* Paint Selection button - always visible */}
                          <TouchableOpacity style={styles.paintSelectionButton} onPress={() => setIsPaintExplorerOpen(true)} activeOpacity={0.8}>
                            <Text style={styles.paintSelectionButtonText}>Paint Selection</Text>
                          </TouchableOpacity>
                        </View>
                      </>
                    )}
                  </View>
                </>
              )}
            </View>
          )}
        </ScrollView>

        {/* Bottom Navigation */}
        <View style={styles.footerContainer}>
          <View style={styles.bottomButtonsRow}>
            <TouchableOpacity style={[styles.galleryButton, !hasContentToView && styles.buttonDisabled]} disabled={!hasContentToView} onPress={() => setIsResultsDrawerOpen(true)} activeOpacity={0.7}>
              <Text style={styles.galleryButtonText}>Gallery</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.createButton, isLoading && styles.cancelButton]} onPress={isLoading ? handleCancelGeneration : handleGenerate} activeOpacity={0.8}>
              <View style={styles.createButtonContent}>
                {!isLoading && <MagicWandIcon color="#F4F4F4" />}
                {isLoading && <SpinnerIcon color="#FFFFFF" />}
                <Text style={[styles.createButtonText, isLoading && styles.cancelButtonText]}>{isLoading ? 'Cancel' : 'Create'}</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        <Modal visible={isResultsDrawerOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setIsResultsDrawerOpen(false)}>
          <SafeAreaView style={styles.modalContainer} edges={['top']}>
            <View style={styles.grabberContainer}><View style={styles.grabber} /></View>
            <View style={styles.modalHeader}><View style={styles.modalHeaderSide} /><Text style={styles.modalTitle}>Results</Text><TouchableOpacity onPress={() => setIsResultsDrawerOpen(false)} style={styles.modalHeaderSide}><Text style={styles.doneButtonText}>Done</Text></TouchableOpacity></View>
            <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
              {activePreviewImage && (
                <View style={styles.resultContainer}>
                  <Image source={{ uri: activePreviewImage }} style={styles.activeResultImage} resizeMode="contain" />
                  <View style={styles.resultActions}>
                    <TouchableOpacity onPress={handleUseAsSource} style={[styles.resultActionButton, styles.resultActionButtonPrimary]}><ToSourceIcon color="#1D1D1D" /><Text style={[styles.resultActionText, styles.resultActionTextDark]}>Use as source</Text></TouchableOpacity>
                    <TouchableOpacity onPress={handleDownload} style={styles.resultActionButtonIcon}><MdFileDownloadIcon color="#F4F4F4" /></TouchableOpacity>
                    <TouchableOpacity onPress={handleShare} style={styles.resultActionButtonIcon}><ShareIcon color="#F4F4F4" /></TouchableOpacity>
                  </View>
                </View>
              )}
              <View style={styles.historyContainer}><Text style={styles.historyTitle}>History</Text><View style={styles.historyGrid}>
                {generationHistory.map((item, i) => (
                  <TouchableOpacity key={i} style={[styles.historyItem, activePreviewImage === item.url && styles.historyItemActive]} onPress={() => setActivePreviewImage(item.url)}><Image source={{ uri: item.url }} style={styles.historyImage} /></TouchableOpacity>
                ))}
              </View></View>
            </ScrollView>
          </SafeAreaView>
        </Modal>

        {/* Paint Explorer Modal */}
        <PaintExplorerModal
          visible={isPaintExplorerOpen}
          onClose={() => setIsPaintExplorerOpen(false)}
          selectedBrands={selectedBrands}
          selectedColors={selectedColors}
          onToggleColor={toggleColor}
          triggerLoad={isPaletteEnabled}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screenContainer: { flex: 1, backgroundColor: '#12121F' },
  statusBarBackground: { height: 0, backgroundColor: '#12121F' },
  container: { flex: 1, backgroundColor: '#1E1E2B' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1E1E2B' },
  topNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: 64, paddingHorizontal: 0, backgroundColor: '#12121F' },
  topNavSide: { width: 91, alignItems: 'center', justifyContent: 'center' },
  topNavTitle: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  userIconContainer: { alignItems: 'flex-end', paddingRight: 16 },
  proBadge: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, borderWidth: 1, borderColor: '#0058DB' },
  proBadgeInactive: { backgroundColor: '#002761' },
  proBadgeActive: { backgroundColor: '#0058DB' },
  proBadgeText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro' : 'System', fontWeight: '500', fontSize: 14, letterSpacing: -0.41, marginLeft: 4 },
  proTextInactive: { color: '#F4F4F4' },
  proTextActive: { color: '#F4F4F4' },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 150 },
  navTabContainer: { flexDirection: 'row', alignSelf: 'stretch', backgroundColor: 'rgba(0, 0, 0, 0.3)', borderRadius: 8, padding: 6, marginBottom: 7 },
  tabButton: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8, borderRadius: 6 },
  tabButtonActive: { backgroundColor: '#0058DB' },
  tabButtonText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '600', fontSize: 14, marginLeft: 4 },
  tabTextActive: { color: '#F4F4F4' },
  tabTextInactive: { color: 'rgba(244, 244, 244, 0.4)' },
  inputContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', alignSelf: 'stretch', backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 8, paddingLeft: 16 },
  sourceInfo: { justifyContent: 'center' },
  inputLabel: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '700', fontSize: 12, color: 'rgba(244, 244, 244, 0.4)' },
  inputSubtitle: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '400', fontSize: 13, color: '#F4F4F4', marginTop: 2 },
  optionsRow: { flexDirection: 'row', alignItems: 'center' },
  optionButton: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 17, paddingHorizontal: 16, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: 4, marginLeft: 8 },
  optionButtonText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '500', fontSize: 13, color: '#F4F4F4', marginLeft: 8 },
  sourceImageWrapper: { width: 50, height: 50, borderRadius: 6, borderWidth: 3, borderColor: '#0058DB', overflow: 'hidden' },
  sourceImage: { width: '100%', height: '100%' },
  removeImageOverlay: { position: 'absolute', top: 0, right: 0, width: 15, height: 15, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  removeImageTextSmall: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
  modeContent: { marginTop: 5, gap: 5, alignSelf: 'stretch' },
  promptContainer: { alignSelf: 'stretch', backgroundColor: 'rgba(0, 0, 0, 0.3)', borderRadius: 8, padding: 16, minHeight: 102 },
  promptInput: { flex: 1, fontFamily: Platform.OS === 'ios' ? 'SF Pro' : 'System', fontSize: 14, color: '#F4F4F4', lineHeight: 20 },
  designStepSection: { gap: 5 },
  paintStepSection: { gap: 5 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'center', gap: 8, padding: 8, marginTop: 12 },
  sectionHeaderText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '600', fontSize: 13, color: 'rgba(244, 244, 244, 0.4)' },
  conceptTabContainer: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', gap: 4 },
  conceptTabButton: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4, paddingVertical: 12, borderRadius: 8, backgroundColor: 'rgba(0, 0, 0, 0.3)', height: 40 },
  conceptTabButtonActive: { backgroundColor: '#F4F4F4' },
  conceptTabText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '600', fontSize: 13 },
  conceptTabTextActive: { color: '#1D1D1D' },
  conceptTabTextInactive: { color: '#F4F4F4' },
  styleGrid: { flexDirection: 'row', alignSelf: 'stretch', flexWrap: 'wrap', gap: 4 },
  styleButton: { justifyContent: 'center', alignItems: 'center', padding: 12, borderRadius: 4, backgroundColor: 'rgba(0, 0, 0, 0.3)' },
  styleButtonActive: { backgroundColor: '#F4F4F4' },
  styleButtonText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '500', fontSize: 13 },
  styleTextActive: { color: '#1D1D1D', fontWeight: '600' },
  styleTextInactive: { color: '#F4F4F4' },
  optionItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', alignSelf: 'stretch', paddingVertical: 12, paddingHorizontal: 12, borderRadius: 4, backgroundColor: 'rgba(255, 255, 255, 0.05)' },
  optionLabel: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '400', fontSize: 14, color: '#F4F4F4' },
  optionLabelActive: { color: '#F4F4F4' },
  toggleContainer: { width: 46, height: 24, padding: 3, borderRadius: 12, justifyContent: 'center' },
  toggleOn: { backgroundColor: '#F4F4F4' },
  toggleOff: { backgroundColor: 'rgba(244, 244, 244, 0.4)' },
  toggleCircle: { width: 18, height: 18, borderRadius: 9 },
  toggleCircleActive: { alignSelf: 'flex-end', backgroundColor: '#0058DB' },
  toggleCircleInactive: { alignSelf: 'flex-start', backgroundColor: '#1D1D1D' },
  paletteContainer: { padding: 12, borderRadius: 8, borderWidth: 2, borderColor: 'rgba(255, 255, 255, 0.05)', backgroundColor: 'transparent', gap: 12, alignSelf: 'stretch' },
  paletteHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  paletteTitle: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '600', fontSize: 13, color: 'rgba(244, 244, 244, 0.4)' },
  clearAllText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '600', fontSize: 13, color: '#FF5050' },
  // Paint Selection Component Styles
  paintSelectionContainer: { borderWidth: 2, borderColor: 'rgba(255, 255, 255, 0.05)', borderRadius: 8, padding: 12, gap: 4, alignSelf: 'stretch', overflow: 'hidden' },
  paintSelectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 4, paddingBottom: 8 },
  paintSelectionCount: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '600', fontSize: 13, color: 'rgba(244, 244, 244, 0.4)', lineHeight: 14 },
  paintSelectionEmpty: { paddingTop: 4, paddingBottom: 8 },
  paintSelectionHint: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '500', fontSize: 14, color: '#F4F4F4', lineHeight: 16 },
  paintSelectionButton: { alignSelf: 'stretch', padding: 16, backgroundColor: '#F4F4F4', borderRadius: 4, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  paintSelectionButtonText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '600', fontSize: 16, color: '#1D1D1D', letterSpacing: -0.408 },
  colorChipsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  colorChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 8, backgroundColor: 'rgba(0, 0, 0, 0.3)', borderRadius: 4 },
  colorChipCircle: { width: 16, height: 16, borderRadius: 8 },
  colorChipName: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '400', fontSize: 13, color: '#F4F4F4', maxWidth: 100 },
  colorChipClose: { marginLeft: 4 },
  // Legacy styles (can be removed if not used elsewhere)
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  colorItem: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, backgroundColor: 'rgba(0, 0, 0, 0.3)', borderRadius: 4 },
  colorRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  colorCircle: { width: 16, height: 16, borderRadius: 8 },
  colorName: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '400', fontSize: 14, color: '#FFFFFF' },
  brandContainer: { gap: 8, alignSelf: 'stretch' },
  brandTabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  brandButton: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 12, borderRadius: 4, backgroundColor: 'rgba(0, 0, 0, 0.3)' },
  brandButtonActive: { backgroundColor: '#F4F4F4' },
  brandText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '500', fontSize: 13 },
  explorerButton: { alignSelf: 'stretch', padding: 16, backgroundColor: '#F4F4F4', borderRadius: 4, alignItems: 'center' },
  explorerButtonText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '600', fontSize: 14, color: '#1D1D1D' },
  footerContainer: { alignSelf: 'stretch', backgroundColor: '#12121F', paddingTop: 32, paddingHorizontal: 16, paddingBottom: 40, height: 130, shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 20 },
  bottomButtonsRow: { flexDirection: 'row', alignSelf: 'stretch', gap: 8 },
  galleryButton: { flex: 1, height: 52, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  galleryButtonText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '500', fontSize: 16, color: '#F4F4F4' },
  createButton: { flex: 1, height: 52, backgroundColor: '#0058DB', borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  createButtonContent: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  createButtonText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '500', fontSize: 16, color: '#F4F4F4' },
  cancelButton: { backgroundColor: '#1D1D1D' },
  cancelButtonText: { color: '#F4F4F4', opacity: 0.3 },
  buttonDisabled: { opacity: 0.5 },
  modalContainer: { flex: 1, backgroundColor: '#12121F' },
  grabberContainer: { width: '100%', height: 24, alignItems: 'center', justifyContent: 'center' },
  grabber: { width: 36, height: 5, borderRadius: 2.5, backgroundColor: 'rgba(255,255,255,0.2)' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 16, paddingHorizontal: 24, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' },
  modalHeaderSide: { width: 50, justifyContent: 'center' },
  modalTitle: { flex: 1, textAlign: 'center', color: '#F4F4F4', fontSize: 16, fontFamily: 'SF Pro Display', fontWeight: '700', letterSpacing: -0.41 },
  doneButtonText: { color: '#0058DB', fontSize: 16, fontWeight: '600', textAlign: 'right' },
  modalContent: { flex: 1, padding: 24 },
  resultContainer: { alignSelf: 'stretch', gap: 8, marginBottom: 32 },
  activeResultImage: { width: '100%', height: 345, borderRadius: 8, backgroundColor: '#000' },
  resultActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, alignSelf: 'stretch' },
  resultActionButton: { flex: 1, minWidth: 100, height: 40, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 12 },
  resultActionButtonPrimary: { backgroundColor: '#F4F4F4' },
  resultActionText: { color: '#F4F4F4', fontSize: 14, fontFamily: 'SF Pro Display', fontWeight: '500', letterSpacing: -0.41 },
  resultActionTextDark: { color: '#1D1D1D' },
  resultActionButtonIcon: { height: 40, paddingHorizontal: 24, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  historyContainer: { alignSelf: 'stretch', gap: 9 },
  historyTitle: { color: '#F4F4F4', fontSize: 16, fontFamily: 'SF Pro Display', fontWeight: '700', letterSpacing: -0.41 },
  historyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: '2%', alignSelf: 'stretch' },
  historyItem: { width: '23.5%', aspectRatio: 1, minWidth: 82, minHeight: 82, borderRadius: 8, overflow: 'hidden' },
  historyItemActive: { borderWidth: 2, borderColor: '#0058DB' },
  historyImage: { width: '100%', height: '100%' },
});
