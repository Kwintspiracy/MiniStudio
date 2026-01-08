import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Image, TextInput,
  ActivityIndicator, Alert, Modal, StyleSheet, Platform, Dimensions, StatusBar
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Rect, Circle } from 'react-native-svg';
import {
  XMarkIcon, RefreshIcon, ArrowsPointingOutIcon, DownloadIcon
} from '../../src/components/Icons';
import { PAINTING_STYLES, DEFAULT_DESIGNER_TEMPLATES } from '../../src/constants';
import type { ImageFile, ToolMode, DesignerType, HistoryItem, StyleOption } from '../../src/types';
import { generatePaintedMiniature, generateImageFromImage, upscaleImage, cancelGeneration } from '../../src/services/geminiService';
import { useImagePicker } from '../../src/hooks/useImagePicker';
import { useMediaSave } from '../../src/hooks/useMediaSave';
import { useAuth } from '../../src/context/AuthContext';

// Get screen dimensions
const { width: SCREEN_WIDTH } = Dimensions.get('window');

// --- Dedicated SVG Icon Components ---

const AppTitleIcon = () => (
  <Svg width={182} height={14} viewBox="0 0 182 14" fill="none">
    <Path d="M0 0.2H17.4V12.9H0V0.2Z" fill="#0058DB"/>
    <Path d="M16.47 0.2H23.51V12.9H16.47V0.2Z" fill="#F4F4F4"/>
    <Path d="M22.58 0.2H35.98V12.9H22.58V0.2Z" fill="#F4F4F4"/>
    <Path d="M35.05 0.2H42.09V12.9H35.05V0.2Z" fill="#F4F4F4"/>
    <Path d="M41.16 0.2H53.62V12.9H41.16V0.2Z" fill="#F4F4F4"/>
    <Path d="M51.3 0.2H63.32V12.9H51.3V0.2Z" fill="#F4F4F4"/>
    <Path d="M63.86 0.2H70.9V12.9H63.86V0.2Z" fill="#F4F4F4"/>
    <Path d="M69.98 0.2H83.38V12.9H69.98V0.2Z" fill="#F4F4F4"/>
    <Path d="M83.9 0.2H94.96V12.9H83.9V0.2Z" fill="#F4F4F4"/>
    <Path d="M93.13 0.2H104.25V12.9H93.13V0.2Z" fill="#F4F4F4"/>
    <Path d="M102.78 0.2H115.24V12.9H102.78V0.2Z" fill="#F4F4F4"/>
    <Path d="M114.88 0H126.96V13.06H114.88V0Z" fill="#F4F4F4"/>
    <Path d="M127.62 0.2H138.68V12.9H127.62V0.2Z" fill="#F4F4F4"/>
    <Path d="M137.54 0.2H150.06V13.06H137.54V0.2Z" fill="#F4F4F4"/>
    <Path d="M149.03 0.2H162.05V12.9H149.03V0.2Z" fill="#F4F4F4"/>
    <Path d="M161.87 0.2H168.91V12.9H161.87V0.2Z" fill="#F4F4F4"/>
    <Path d="M168.68 0H181.52V13.06H168.68V0Z" fill="#F4F4F4"/>
  </Svg>
);

const BiSolidUserCircleIcon = ({ color = "#FFFFFF", opacity = 1 }: { color?: string, opacity?: number }) => (
  <Svg width={32} height={32} viewBox="0 0 32 32" fill="none">
    <Circle cx="16" cy="16" r="13.33" stroke={color} strokeWidth={2} strokeOpacity={opacity}/>
    <Circle cx="16" cy="12" r="4" fill={color} fillOpacity={opacity}/>
    <Path d="M16 21.33C12.33 21.33 8.87 23.16 7.47 26.13C9.64 28.16 12.63 29.33 16 29.33C19.37 29.33 22.36 28.16 24.53 26.13C23.13 23.16 19.67 21.33 16 21.33Z" fill={color} fillOpacity={opacity}/>
  </Svg>
);

const BiSolidPaletteIcon = ({ color = "#F4F4F4", opacity = 1 }: { color?: string, opacity?: number }) => (
  <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
    <Path d="M8 14.6663C11.682 14.6663 14.6667 11.6816 14.6667 7.99967C14.6667 4.31777 11.682 1.33301 8 1.33301C4.3181 1.33301 1.33333 4.31777 1.33333 7.99967C1.33333 11.6816 4.3181 14.6663 8 14.6663ZM8 12.6663C10.5773 12.6663 12.6667 10.577 12.6667 7.99967C12.6667 5.42235 10.5773 3.33301 8 3.33301C5.42267 3.33301 3.33333 5.42235 3.33333 7.99967C3.33333 10.577 5.42267 12.6663 8 12.6663ZM5.33333 7.99967C6.06971 7.99967 6.66667 7.40272 6.66667 6.66634C6.66667 5.92996 6.06971 5.33301 5.33333 5.33301C4.59695 5.33301 4 5.92996 4 6.66634C4 7.40272 4.59695 7.99967 5.33333 7.99967ZM10.6667 7.99967C11.403 7.99967 12 7.40272 12 6.66634C12 5.92996 11.403 5.33301 10.6667 5.33301C9.93029 5.33301 9.33333 5.92996 9.33333 6.66634C9.33333 7.40272 9.93029 7.99967 10.6667 7.99967Z" fill={color} fillOpacity={opacity}/>
  </Svg>
);

const BuildIcon = ({ color = "#F4F4F4", opacity = 1 }: { color?: string, opacity?: number }) => (
  <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
    <Path d="M14.3125 3.28125H5.875C5.59844 3.28125 5.375 3.50469 5.375 3.78125V7.46875H1.6875C1.41094 7.46875 1.1875 7.69219 1.1875 7.96875V12.2188C1.1875 12.4953 1.41094 12.7188 1.6875 12.7188H10.125C10.4016 12.7188 10.625 12.4953 10.625 12.2188V8.53125H14.3125C14.5891 8.53125 14.8125 8.30781 14.8125 8.03125V3.78125C14.8125 3.50469 14.5891 3.28125 14.3125 3.28125ZM9.5625 11.6562H6.4375V8.53125H9.5625V11.6562ZM13.75 7.46875H10.625V4.34375H13.75V7.46875Z" fill={color} fillOpacity={opacity}/>
  </Svg>
);

const RiPaintFillIcon = ({ color = "#F4F4F4", opacity = 1 }: { color?: string, opacity?: number }) => (
  <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
    <Path d="M12.8185 12.4881L13.997 11.3096L15.1755 12.4881C15.8263 13.139 15.8263 14.1943 15.1755 14.8451C14.5246 15.496 13.4693 15.496 12.8185 14.8451C12.1676 14.1943 12.1676 13.139 12.8185 12.4881ZM5.91907 0.719727L13.4615 8.26219C13.7219 8.52252 13.7219 8.94465 13.4615 9.20499L7.80467 14.8619C7.54433 15.1222 7.1222 15.1222 6.86187 14.8619L1.20503 9.20499C0.944679 8.94465 0.944679 8.52252 1.20503 8.26219L6.39048 3.07675L4.97627 1.66254L5.91907 0.719727ZM7.33327 4.01956L2.61924 8.73359H12.0473L7.33327 4.01956Z" fill={color} fillOpacity={opacity}/>
  </Svg>
);

const AiFillFireIcon = ({ color = "#F4F4F4", opacity = 1 }: { color?: string, opacity?: number }) => (
  <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
    <Path d="M13.0328 7.33143C12.7295 6.6487 12.2885 6.03592 11.7375 5.53143L11.2828 5.11424C11.2674 5.10046 11.2488 5.09069 11.2287 5.08577C11.2086 5.08085 11.1876 5.08094 11.1675 5.08603C11.1475 5.09112 11.129 5.10106 11.1137 5.11497C11.0984 5.12887 11.0867 5.14633 11.0797 5.1658L10.8766 5.74861C10.75 6.11424 10.5172 6.48768 10.1875 6.85486C10.1656 6.8783 10.1406 6.88455 10.1234 6.88611C10.1063 6.88768 10.0797 6.88455 10.0562 6.86268C10.0344 6.84393 10.0234 6.8158 10.025 6.78768C10.0828 5.84705 9.80156 4.78611 9.18594 3.63143C8.67656 2.67205 7.96875 1.92361 7.08437 1.40174L6.43906 1.02205C6.35469 0.972052 6.24688 1.03768 6.25156 1.13611L6.28594 1.88611C6.30937 2.39861 6.25 2.85174 6.10938 3.2283C5.9375 3.68924 5.69063 4.11736 5.375 4.50174C5.15535 4.76887 4.90639 5.01049 4.63281 5.22205C3.97391 5.72856 3.43815 6.37757 3.06562 7.12049C2.69402 7.86989 2.50045 8.69496 2.5 9.53143C2.5 10.2689 2.64531 10.983 2.93281 11.6564C3.21042 12.3048 3.61103 12.8933 4.1125 13.3892C4.61875 13.8892 5.20625 14.283 5.86094 14.5564C6.53906 14.8408 7.25781 14.9846 8 14.9846C8.74219 14.9846 9.46094 14.8408 10.1391 14.558C10.7921 14.2862 11.386 13.8897 11.8875 13.3908C12.3937 12.8908 12.7906 12.3064 13.0672 11.658C13.3543 10.9864 13.5015 10.2634 13.5 9.53299C13.5 8.77049 13.3437 8.02986 13.0328 7.33143Z" fill={color} fillOpacity={opacity}/>
  </Svg>
);

const DrawIcon = ({ color = "#1D1D1D" }: { color?: string }) => (
  <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
    <Path d="M12.5667 6.92667L13.2733 6.22C13.7933 5.7 13.7933 4.85333 13.2733 4.33333L12.3333 3.39333C11.8133 2.87333 10.9667 2.87333 10.4467 3.39333L9.74 4.1L12.5667 6.92667ZM8.79333 5.04L2.66667 11.1733V14H5.49333L11.62 7.87333L8.79333 5.04ZM12.6667 11.6667C12.6667 13.1267 10.9733 14 9.33333 14C8.96667 14 8.66667 13.7 8.66667 13.3333C8.66667 12.9667 8.96667 12.6667 9.33333 12.6667C10.36 12.6667 11.3333 12.18 11.3333 11.6667C11.3333 11.3533 11.0133 11.0867 10.5133 10.8667L11.5 9.88C12.2133 10.3 12.6667 10.86 12.6667 11.6667ZM3.05333 8.9C2.40667 8.52667 2 8.04 2 7.33333C2 6.13333 3.26 5.58 4.37333 5.09333C5.06 4.78667 6 4.37333 6 4C6 3.72667 5.48 3.33333 4.66667 3.33333C3.82667 3.33333 3.46667 3.74 3.44667 3.76C3.21333 4.03333 2.79333 4.06667 2.51333 3.84C2.37965 3.7302 2.29431 3.57239 2.27561 3.4004C2.25692 3.22842 2.30636 3.05596 2.41333 2.92C2.48667 2.82667 3.17333 2 4.66667 2C6.16 2 7.33333 2.88 7.33333 4C7.33333 5.24667 6.04667 5.81333 4.90667 6.31333C4.28 6.58667 3.33333 7 3.33333 7.33333C3.33333 7.54 3.62 7.73333 4.04667 7.90667L3.05333 8.9Z" fill={color}/>
  </Svg>
);

const SculptIcon = ({ color = "#F4F4F4" }: { color?: string }) => (
  <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
    <Path d="M11.836 9.33294C12.6414 9.33294 13.2985 9.96801 13.3338 10.7647L13.3332 10.833L8.00231 10.8329V11.499L13.3191 11.4998C13.2786 11.8542 13.1627 12.1953 12.98 12.5005L8.00231 12.499V13.1663L12.428 13.167C11.3874 14.1709 9.9015 14.6671 7.99991 14.6671C5.90268 14.6671 4.31201 14.0636 3.2678 12.8408C2.88129 12.3881 2.66895 11.8125 2.66895 11.2173V10.8322C2.66895 10.0042 3.34019 9.33294 4.1682 9.33294H11.836ZM7.99991 1.33301C9.09044 1.33301 10.0586 1.85665 10.6667 2.66621L8.0019 2.66634L8.00164 3.33234L11.056 3.33331C11.192 3.6447 11.2818 3.98089 11.3168 4.33321L8.00164 4.33234V4.99901L11.3168 5.00014C11.2817 5.35247 11.1918 5.68865 11.0557 6.00003L8.00164 5.99901L8.0019 6.66634L10.6662 6.66714C10.058 7.47634 9.09011 7.99967 7.99991 7.99967C6.15897 7.99967 4.66659 6.50729 4.66659 4.66634C4.66659 2.82539 6.15897 1.33301 7.99991 1.33301Z" fill={color}/>
  </Svg>
);

const ApertureIcon = ({ color = "#F4F4F4" }: { color?: string }) => (
  <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
    <Path d="M12.7757 3.22688C11.8317 2.28292 10.629 1.64009 9.31963 1.37967C8.01027 1.11926 6.65309 1.25295 5.41972 1.76386C4.18634 2.27476 3.13216 3.13993 2.39048 4.24995C1.6488 5.35997 1.25293 6.665 1.25293 8C1.25293 9.33501 1.6488 10.64 2.39048 11.7501C3.13216 12.8601 4.18634 13.7252 5.41972 14.2361C6.65309 14.7471 8.01027 14.8808 9.31963 14.6203C10.629 14.3599 11.8317 13.7171 12.7757 12.7731C13.4072 12.1489 13.9086 11.4057 14.2508 10.5863C14.5929 9.767 14.7691 8.88791 14.7691 8C14.7691 7.11209 14.5929 6.23301 14.2508 5.41368C13.9086 4.59435 13.4072 3.85106 12.7757 3.22688ZM11.7132 4.28938C11.9149 4.49005 12.0999 4.70681 12.2664 4.9375L10.5626 6.94313L9.10637 2.8675C10.0949 3.07835 11.0009 3.57165 11.7145 4.2875L11.7132 4.28938ZM4.28512 4.28938C5.1414 3.42876 6.27111 2.89386 7.4795 2.77688L8.3645 5.255L4.107 4.47563C4.16512 4.41188 4.2245 4.34938 4.28637 4.2875L4.28512 4.28938ZM3.00012 9.60625C2.60414 8.36674 2.67981 7.02465 3.21262 5.8375L5.80262 6.3125L3.00012 9.60625ZM4.2845 11.7125C4.08364 11.5111 3.89949 11.2937 3.73387 11.0625L5.43762 9.05688L6.89387 13.1325C5.90559 12.9215 4.99978 12.4282 4.28637 11.7125H4.2845ZM6.557 7.73688L7.50575 6.62125L8.947 6.88438L9.4395 8.26313L8.49137 9.37875L7.05012 9.11563L6.557 7.73688ZM11.7126 11.7125C10.8562 12.5729 9.72656 13.1078 8.51825 13.225L7.6345 10.75L11.8932 11.5275C11.8351 11.5881 11.7757 11.6506 11.7145 11.7125H11.7126ZM10.1976 9.6875L13.0001 6.39375C13.3962 7.63331 13.3203 8.97551 12.787 10.1625L10.1976 9.6875Z" fill={color}/>
  </Svg>
);

const MagicWandIcon = ({ color = "#F4F4F4" }: { color?: string }) => (
  <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
    <Path d="M7.33321 2.66667L6.99988 2L6.66655 2.66667L5.99988 2.75L6.55588 3.222L6.33321 4L6.99988 3.556L7.66655 4L7.44388 3.222L7.99988 2.75L7.33321 2.66667ZM12.8892 9.77733L12.3332 8.66667L11.7772 9.77733L10.6665 9.91667L11.5925 10.704L11.2225 12L12.3332 11.2593L13.4439 12L13.0739 10.704L13.9999 9.91667L12.8892 9.77733ZM4.44455 4.222L3.99988 3.33333L3.55521 4.222L2.66655 4.33333L3.40721 4.96267L3.11121 6L3.99988 5.40733L4.88855 6L4.59255 4.96267L5.33321 4.33321L4.44455 4.222ZM2.27588 11.3333C2.27588 11.6893 2.41455 12.024 2.66655 12.276L3.72388 13.3333C3.97588 13.5853 4.31055 13.724 4.66655 13.724C5.02255 13.724 5.35721 13.5853 5.60921 13.3333L13.3332 5.60933C13.5852 5.35733 13.7239 5.02267 13.7239 4.66667C13.7239 4.31067 13.5852 3.976 13.3332 3.724L12.2759 2.66667C11.7719 2.16267 10.8945 2.16267 10.3905 2.66667L2.66655 10.3907C2.41455 10.6427 2.27588 10.9773 2.27588 11.3333ZM11.3332 3.60933L12.3905 4.66667L9.99988 7.05733L8.94255 6L11.3332 3.60933Z" fill={color}/>
  </Svg>
);

const PhotoCameraIcon = ({ color = "#F4F4F4" }: { color?: string }) => (
  <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
    <Path d="M8.00003 10.1329C9.17824 10.1329 10.1334 9.17775 10.1334 7.99954C10.1334 6.82134 9.17824 5.86621 8.00003 5.86621C6.82182 5.86621 5.8667 6.82134 5.8667 7.99954C5.8667 9.17775 6.82182 10.1329 8.00003 10.1329Z" fill={color}/>
    <Path d="M6.00016 1.33301L4.78016 2.66634H2.66683C1.9335 2.66634 1.3335 3.26634 1.3335 3.99967V11.9997C1.3335 12.733 1.9335 13.333 2.66683 13.333H13.3335C14.0668 13.333 14.6668 12.733 14.6668 11.9997V3.99967C14.6668 3.26634 14.0668 2.66634 13.3335 2.66634H11.2202L10.0002 1.33301H6.00016ZM8.00016 11.333C6.16016 11.333 4.66683 9.83967 4.66683 7.99967C4.66683 6.15967 6.16016 4.66634 8.00016 4.66634C9.84016 4.66634 11.3335 6.15967 11.3335 7.99967C11.3335 9.83967 9.84016 11.333 8.00016 11.333Z" fill={color}/>
  </Svg>
);

const PhotoLibraryIcon = ({ color = "#F4F4F4" }: { color?: string }) => (
  <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
    <Path d="M14.6668 10.6663V2.66634C14.6668 1.93301 14.0668 1.33301 13.3335 1.33301H5.3335C4.60016 1.33301 4.00016 1.93301 4.00016 2.66634V10.6663C4.00016 11.3997 4.60016 11.9997 5.3335 11.9997H13.3335C14.0668 11.9997 14.6668 11.3997 14.6668 10.6663ZM7.3335 7.99967L8.68683 9.80634L10.6668 7.33301L13.3335 10.6663H5.3335L7.3335 7.99967ZM1.3335 3.99967V13.333C1.3335 14.0663 1.9335 14.6663 2.66683 14.6663H12.0002V13.333H2.66683V3.99967H1.3335Z" fill={color}/>
  </Svg>
);

const TbProgressCheckIcon = ({ color = "#F4F4F4" }: { color?: string }) => (
  <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
    <Path d="M6.66652 13.8511C6.08626 13.7195 5.52897 13.5017 5.01318 13.2051" stroke={color} stroke-linecap="round" stroke-linejoin="round"/>
    <Path d="M9.3335 2.14844C10.6589 2.45115 11.8423 3.1949 12.6899 4.25791C13.5375 5.32092 13.9991 6.64021 13.9991 7.99977C13.9991 9.35934 13.5375 10.6786 12.6899 11.7416C11.8423 12.8046 10.6589 13.5484 9.3335 13.8511" stroke={color} stroke-linecap="round" stroke-linejoin="round"/>
    <Path d="M3.05286 11.395C2.6892 10.8666 2.413 10.2832 2.23486 9.66699" stroke={color} stroke-linecap="round" stroke-linejoin="round"/>
    <Path d="M2.08252 7.00034C2.18919 6.36701 2.39452 5.76701 2.68252 5.21701L2.79519 5.01367" stroke={color} stroke-linecap="round" stroke-linejoin="round"/>
    <Path d="M4.60449 3.05244C5.22826 2.62304 5.92804 2.31625 6.66649 2.14844" stroke={color} stroke-linecap="round" stroke-linejoin="round"/>
    <Path d="M6 8.00033L7.33333 9.33366L10 6.66699" stroke={color} stroke-linecap="round" stroke-linejoin="round"/>
  </Svg>
);

const SpinnerIcon = ({ color = "#FFFFFF" }: { color?: string }) => (
  <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
    <Path opacity="0.2" fill-rule="evenodd" clip-rule="evenodd" d="M8.00016 12.6663C10.5775 12.6663 12.6668 10.577 12.6668 7.99967C12.6668 5.42235 10.5775 3.33301 8.00016 3.33301C5.42284 3.33301 3.3335 5.42235 3.3335 7.99967C3.3335 10.577 5.42284 12.6663 8.00016 12.6663ZM8.00016 14.6663C11.682 14.6663 14.6668 11.6815 14.6668 7.99967C14.6668 4.31777 11.682 1.33301 8.00016 1.33301C4.31826 1.33301 1.3335 4.31777 1.3335 7.99967C1.3335 11.6815 4.31826 14.6663 8.00016 14.6663Z" fill={color}/>
    <Path d="M1.3335 7.99967C1.3335 4.31777 4.31826 1.33301 8.00016 1.33301V3.33301C5.42284 3.33301 3.3335 5.42235 3.3335 7.99967H1.3335Z" fill={color}/>
  </Svg>
);

const FireIcon = ({ color = "#FFFFFF" }: { color?: string }) => (
  <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
    <Path d="M10.1533 1.33301C10.1533 1.33301 8.84667 3.33301 8.84667 5.33301C8.84667 6.43301 9.74 7.33301 10.84 7.33301C11.94 7.33301 12.8333 6.43301 12.8333 5.33301C12.8333 3.33301 10.1533 1.33301 10.1533 1.33301Z" fill={color}/>
    <Path d="M7.99991 14.6663C10.9454 14.6663 13.3332 12.2785 13.3332 9.33301C13.3332 7.85967 12.7332 6.52634 11.7666 5.55967C11.4532 5.24634 10.8932 5.61967 10.8932 6.05967C10.8932 6.75967 10.3266 7.33301 9.62658 7.33301C8.92658 7.33301 8.35991 6.75967 8.35991 6.05967C8.35991 4.71967 9.07324 3.51301 10.1266 2.81301C10.4532 2.59967 10.2799 2.09301 9.89324 2.14634C8.42658 2.34634 7.07324 3.09301 6.09991 4.24634C5.12658 5.39967 4.66658 6.85301 4.66658 8.44634C4.66658 10.2597 5.40658 11.8997 6.59324 13.0863C6.96658 13.4597 7.45991 13.753 7.99991 13.913" fill={color}/>
  </Svg>
);

const PaletteIcon = ({ color = "#FFFFFF" }: { color?: string }) => (
  <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
    <Path d="M8 14.6663C11.682 14.6663 14.6667 11.6816 14.6667 7.99967C14.6667 4.31777 11.682 1.33301 8 1.33301C4.3181 1.33301 1.33333 4.31777 1.33333 7.99967C1.33333 11.6816 4.3181 14.6663 8 14.6663ZM8 12.6663C10.5773 12.6663 12.6667 10.577 12.6667 7.99967C12.6667 5.42235 10.5773 3.33301 8 3.33301C5.42267 3.33301 3.33333 5.42235 3.33333 7.99967C3.33333 10.577 5.42267 12.6663 8 12.6663ZM5.33333 7.99967C6.06971 7.99967 6.66667 7.40272 6.66667 6.66634C6.66667 5.92996 6.06971 5.33301 5.33333 5.33301C4.59695 5.33301 4 5.92996 4 6.66634C4 7.40272 4.59695 7.99967 5.33333 7.99967ZM10.6667 7.99967C11.403 7.99967 12 7.40272 12 6.66634C12 5.92996 11.403 5.33301 10.6667 5.33301C9.93029 5.33301 9.33333 5.92996 9.33333 6.66634C9.33333 7.40272 9.93029 7.99967 10.6667 7.99967Z" fill={color}/>
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
      <RiPaintFillIcon color={activeTab === 'painter' ? '#FFFFFF' : '#F4F4F4'} opacity={activeTab === 'painter' ? 1 : 0.4} />
      <Text style={[styles.tabButtonText, activeTab === 'painter' ? styles.tabTextActive : styles.tabTextInactive]}>PAINT</Text>
    </TouchableOpacity>
  </View>
);

const ConceptNavTab = ({ activeType, onTypeChange }: { activeType: DesignerType; onTypeChange: (type: DesignerType) => void }) => {
  const tabs: { id: DesignerType; label: string; Icon: any }[] = [
    { id: 'sketch', label: 'Sketch', Icon: DrawIcon },
    { id: 'miniature', label: 'Sculpt', Icon: SculptIcon },
    { id: 'pro-shot', label: 'Photoshoot', Icon: ApertureIcon }
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
    <TbProgressCheckIcon color={isPro ? "#1D1D1D" : "#FFFFFF"} />
    <Text style={[styles.proBadgeText, isPro ? styles.proTextActive : styles.proTextInactive]}>Pro</Text>
  </TouchableOpacity>
);

export default function StudioScreen() {
  const { loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<ToolMode>('designer');
  const [designerType, setDesignerType] = useState<DesignerType>('sketch');
  const [selectedStyle, setSelectedStyle] = useState<StyleOption>(PAINTING_STYLES[0]);
  const [isNMMEnabled, setIsNMMEnabled] = useState(false);
  const [isOSLEnabled, setIsOSLEnabled] = useState(false);
  const [isPaletteEnabled, setIsPaletteEnabled] = useState(false);
  
  const [designerPrompt, setDesignerPrompt] = useState('');
  const [painterPrompt, setPainterPrompt] = useState('');
  const [isPro, setIsPro] = useState(false);
  
  const [sourceImages, setSourceImages] = useState<ImageFile[]>([]);
  const [activePreviewImage, setActivePreviewImage] = useState<string | null>(null);
  const [generationHistory, setGenerationHistory] = useState<HistoryItem[]>([]);
  
  const [isLoading, setIsLoading] = useState(false);
  const [isUpscaling, setIsUpscaling] = useState(false);
  const [isResultsDrawerOpen, setIsResultsDrawerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { pickMultipleImages } = useImagePicker();
  const { saveImage } = useMediaSave();

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
        const promptParts: string[] = [selectedStyle.prompt, painterPrompt];
        if (isNMMEnabled) promptParts.push("using the Non-Metallic Metal (NMM) technique for all metallic parts");
        if (isOSLEnabled) promptParts.push("Integrate Object Source Lighting (OSL) showing realistic colored light emanating from specific points");
        promptParts.push("GENERATE THE IMAGE NOW. Do not output conversational text.");
        const finalPrompt = promptParts.filter(Boolean).join(' ');
        images = await generatePaintedMiniature(sourceImages, finalPrompt, 1, model);
      } else if (activeTab === 'designer') {
        const characterDesc = designerPrompt.trim() || 'character';
        const typeToUse = sourceImages.length > 1 ? 'combined' : designerType;
        const template = DEFAULT_DESIGNER_TEMPLATES[typeToUse];
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
  }, [sourceImages, activeTab, designerPrompt, designerType, isPro, painterPrompt, selectedStyle, isNMMEnabled, isOSLEnabled]);

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

  const handleUseAsSource = useCallback(() => {
    if (!activePreviewImage) return;
    const newImage: ImageFile = { base64: activePreviewImage, mimeType: 'image/png' };
    setSourceImages([newImage]);
    setIsResultsDrawerOpen(false);
  }, [activePreviewImage]);

  if (authLoading) return <View style={styles.centered}><ActivityIndicator size="large" color="#0058DB" /></View>;

  const hasImageLoaded = sourceImages.length > 0;
  const hasContentToView = hasImageLoaded || generationHistory.length > 0;

  const paintStyles = [
    { id: 'none', name: 'Custom' },
    { id: 'heavy-metal', name: "'Eavy Metal" },
    { id: 'craftworld', name: 'Craftworld Studio' },
    { id: 'blanchitsu', name: 'Blanchitsu' },
    { id: 'slapchop', name: 'Slapshop' },
    { id: 'grimdark', name: 'Grimdark' },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      
      {/* Top Navigation */}
      <View style={styles.topNav}>
        <View style={styles.topNavSide}>
          <ProBadge isPro={isPro} onToggle={() => setIsPro(!isPro)} />
        </View>
        <AppTitleIcon />
        <TouchableOpacity 
          onPress={() => router.push('/settings')} 
          style={styles.topNavSide} 
          activeOpacity={0.7}
        >
          <BiSolidUserCircleIcon color="#F4F4F4" />
        </TouchableOpacity>
      </View>

      {/* Main Content Area */}
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <MainNavTab activeTab={activeTab} onTabChange={setActiveTab} />

        {/* Input Container */}
        <View style={styles.inputContainer}>
          <View style={styles.sourceInfo}>
            <Text style={styles.inputLabel}>{activeTab === 'painter' ? 'SOURCE' : 'Input'}</Text>
            <Text style={styles.inputSubtitle}>
              {hasImageLoaded ? 'Image to Image Generation' : 'Choose an image'}
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
                <PhotoCameraIcon color="#F4F4F4" />
                <Text style={styles.optionButtonText}>Photo</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.optionButton} onPress={handlePickImage} activeOpacity={0.8}>
                <PhotoLibraryIcon color="#F4F4F4" />
                <Text style={styles.optionButtonText}>Files</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* DESIGN/PAINT STEP Section */}
        {hasImageLoaded && (
          <View style={styles.modeContent}>
            {/* Common Prompt Area */}
            <View style={styles.promptContainer}>
              <TextInput
                value={activeTab === 'designer' ? designerPrompt : painterPrompt}
                onChangeText={activeTab === 'designer' ? setDesignerPrompt : setPainterPrompt}
                placeholder="You can add more details to the default prompt..."
                placeholderTextColor="rgba(244, 244, 244, 0.4)"
                multiline
                textAlignVertical="top"
                style={styles.promptInput}
              />
            </View>

            {/* Mode-Specific Controls */}
            {activeTab === 'designer' ? (
              <View style={styles.designStepSection}>
                <View style={styles.stepTitleRow}>
                  <BuildIcon color="rgba(244, 244, 244, 0.4)" />
                  <Text style={styles.stepTitleText}>DESIGN STEP</Text>
                </View>
                <ConceptNavTab activeType={designerType} onTypeChange={setDesignerType} />
              </View>
            ) : (
              <View style={styles.paintStepSection}>
                {/* Style Section */}
                <View style={styles.sectionHeader}>
                  <RiPaintFillIcon color="#F4F4F4" />
                  <Text style={styles.sectionHeaderText}>CHOOSE A STYLE</Text>
                </View>
                <View style={styles.styleGrid}>
                  {paintStyles.map((style) => (
                    <TouchableOpacity
                      key={style.id}
                      onPress={() => setSelectedStyle(PAINTING_STYLES.find(s => s.id === style.id) || PAINTING_STYLES[0])}
                      style={[styles.styleButton, selectedStyle.id === style.id && styles.styleButtonActive]}
                    >
                      <Text style={[styles.styleButtonText, selectedStyle.id === style.id ? styles.styleTextActive : styles.styleTextInactive]}>
                        {style.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Effects Section */}
                <View style={styles.sectionHeader}>
                  <AiFillFireIcon color="#F4F4F4" />
                  <Text style={styles.sectionHeaderText}>ADD EFFECTS</Text>
                </View>
                <View style={styles.optionItem}>
                  <Text style={styles.optionLabel}>NNM - Non Metallic Metal</Text>
                  <ToggleButton value={isNMMEnabled} onToggle={() => setIsNMMEnabled(!isNMMEnabled)} />
                </View>
                <View style={styles.optionItem}>
                  <Text style={styles.optionLabel}>OSL - Object Source Lighting</Text>
                  <ToggleButton value={isOSLEnabled} onToggle={() => setIsOSLEnabled(!isOSLEnabled)} />
                </View>

                {/* Palette Section */}
                <View style={styles.sectionHeader}>
                  <BiSolidPaletteIcon color="#F4F4F4" />
                  <Text style={styles.sectionHeaderText}>COLOR PALETTE</Text>
                </View>
                <View style={styles.optionItem}>
                  <Text style={styles.optionLabel}>Use a color palette</Text>
                  <ToggleButton value={isPaletteEnabled} onToggle={() => setIsPaletteEnabled(!isPaletteEnabled)} />
                </View>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Bottom Navigation */}
      <View style={styles.bottomNav}>
        <View style={styles.bottomButtonsRow}>
          <TouchableOpacity 
            style={[styles.galleryButton, !hasContentToView && styles.buttonDisabled]}
            disabled={!hasContentToView}
            onPress={() => setIsResultsDrawerOpen(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.galleryButtonText}>Gallery</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.createButton, isLoading && styles.cancelButton]} 
            onPress={isLoading ? handleCancelGeneration : handleGenerate}
            activeOpacity={0.8}
          >
            <View style={styles.createButtonContent}>
              {!isLoading && <MagicWandIcon color="#FFFFFF" />}
              {isLoading && <SpinnerIcon color="#FFFFFF" />}
              <Text style={[styles.createButtonText, isLoading && styles.cancelButtonText]}>
                {isLoading ? 'Cancel' : 'Create'}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* Results/Gallery Modal */}
      <Modal
        visible={isResultsDrawerOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsResultsDrawerOpen(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>RESULTS</Text>
            <TouchableOpacity onPress={() => setIsResultsDrawerOpen(false)}>
              <XMarkIcon size={24} color="#F4F4F4" />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalContent}>
            {activePreviewImage && (
              <View style={styles.activeResultContainer}>
                <Image source={{ uri: activePreviewImage }} style={styles.activeResultImage} resizeMode="contain" />
                <View style={styles.resultActions}>
                  <TouchableOpacity onPress={handleDownload} style={styles.actionIcon}><DownloadIcon size={20} color="#F4F4F4" /></TouchableOpacity>
                  <TouchableOpacity onPress={handleUpscale} disabled={isUpscaling} style={styles.actionIcon}>
                    {isUpscaling ? <ActivityIndicator size="small" color="#F4F4F4" /> : <ArrowsPointingOutIcon size={20} color="#F4F4F4" />}
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleUseAsSource} style={styles.actionIcon}><RefreshIcon size={20} color="#F4F4F4" /></TouchableOpacity>
                </View>
              </View>
            )}
            <Text style={styles.historyLabel}>History</Text>
            <View style={styles.galleryGrid}>
              {generationHistory.map((item, i) => (
                <TouchableOpacity key={i} style={styles.galleryItem} onPress={() => setActivePreviewImage(item.url)}>
                  <Image source={{ uri: item.url }} style={styles.galleryImage} />
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1E1E2B' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1E1E2B' },
  topNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: 54, paddingHorizontal: 16, marginTop: 8 },
  topNavSide: { width: 91, justifyContent: 'center' },
  proBadge: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#0058DB',
  },
  proBadgeInactive: {
    backgroundColor: '#003583',
  },
  proBadgeActive: {
    backgroundColor: '#0058DB',
  },
  proBadgeText: {
    fontFamily: Platform.OS === 'ios' ? 'SF Pro' : 'System',
    fontWeight: '500',
    fontSize: 14,
    letterSpacing: -0.41,
    marginLeft: 4,
  },
  proTextInactive: {
    color: '#F4F4F4',
  },
  proTextActive: {
    color: '#1D1D1D',
  },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 150 },
  navTabContainer: { flexDirection: 'row', width: '100%', backgroundColor: 'rgba(0, 0, 0, 0.3)', borderRadius: 8, padding: 6, marginBottom: 7 },
  tabButton: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8, borderRadius: 6 },
  tabButtonActive: { backgroundColor: '#0058DB' },
  tabButtonText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '600', fontSize: 14, marginLeft: 4 },
  tabTextActive: { color: '#F4F4F4' },
  tabTextInactive: { color: 'rgba(244, 244, 244, 0.4)' },
  inputContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 8, paddingLeft: 16 },
  sourceInfo: { justifyContent: 'center' },
  inputLabel: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '700', fontSize: 12, color: 'rgba(244, 244, 244, 0.4)' },
  inputSubtitle: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '400', fontSize: 13, color: '#F4F4F4', marginTop: 2 },
  optionsRow: { flexDirection: 'row', alignItems: 'center' },
  optionButton: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 17, paddingHorizontal: 16, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: 4, marginLeft: 8 },
  optionButtonText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '500', fontSize: 13, color: '#F4F4F4', marginLeft: 8 },
  sourceImageWrapper: { width: 50, height: 50, borderRadius: 6, borderWidth: 2, borderColor: '#0058DB', overflow: 'hidden' },
  sourceImage: { width: '100%', height: '100%' },
  removeImageOverlay: { position: 'absolute', top: 0, right: 0, width: 15, height: 15, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  removeImageTextSmall: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
  modeContent: { marginTop: 12, gap: 12 },
  promptContainer: { alignSelf: 'stretch', backgroundColor: 'rgba(0, 0, 0, 0.3)', borderRadius: 8, padding: 16, minHeight: 102 },
  promptInput: { flex: 1, fontFamily: Platform.OS === 'ios' ? 'SF Pro' : 'System', fontSize: 14, color: '#F4F4F4', lineHeight: 20 },
  designStepSection: { gap: 5 },
  paintStepSection: { gap: 8 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, padding: 8 },
  sectionHeaderText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '600', fontSize: 13, color: '#F4F4F4' },
  stepTitleRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, padding: 8 },
  stepTitleText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '600', fontSize: 13, color: 'rgba(244, 244, 244, 0.4)' },
  conceptTabContainer: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', gap: 4 },
  conceptTabButton: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4, paddingVertical: 12, borderRadius: 8, backgroundColor: 'rgba(0, 0, 0, 0.3)', height: 40 },
  conceptTabButtonActive: { backgroundColor: '#F4F4F4' },
  conceptTabText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '600', fontSize: 13 },
  conceptTabTextActive: { color: '#1D1D1D' },
  conceptTabTextInactive: { color: '#F4F4F4' },
  styleGrid: { flexDirection: 'row', alignSelf: 'stretch', flexWrap: 'wrap', gap: 4 },
  styleButton: { justifyContent: 'center', alignItems: 'center', padding: 12, borderRadius: 4, backgroundColor: 'rgba(0, 0, 0, 0.3)' },
  styleButtonActive: { backgroundColor: '#F4F4F4' },
  styleButtonText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '400', fontSize: 13 },
  styleTextActive: { color: '#1D1D1D' },
  styleTextInactive: { color: '#F4F4F4' },
  optionItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', alignSelf: 'stretch', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 4, backgroundColor: 'rgba(255, 255, 255, 0.05)' },
  optionLabel: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '400', fontSize: 13, color: 'rgba(244, 244, 244, 0.4)' },
  toggleContainer: { width: 46, height: 24, borderRadius: 16, padding: 4, justifyContent: 'center' },
  toggleOn: { backgroundColor: '#F4F4F4' },
  toggleOff: { backgroundColor: 'rgba(244, 244, 244, 0.4)' },
  toggleCircle: { width: 18, height: 18, borderRadius: 9 },
  toggleCircleActive: { alignSelf: 'flex-end', backgroundColor: '#0058DB' },
  toggleCircleInactive: { alignSelf: 'flex-start', backgroundColor: '#1D1D1D' },
  bottomNav: { position: 'absolute', bottom: 0, width: SCREEN_WIDTH, backgroundColor: '#12121F', paddingTop: 24, paddingHorizontal: 16, paddingBottom: 40, shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 20 },
  bottomButtonsRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  galleryButton: { flex: 1, height: 40, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 4 },
  galleryButtonText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '500', fontSize: 16, color: '#F4F4F4' },
  createButton: { flex: 1, height: 40, backgroundColor: '#0058DB', borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginLeft: 4 },
  createButtonContent: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  createButtonText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '500', fontSize: 16, color: '#F4F4F4' },
  cancelButton: { backgroundColor: '#1D1D1D' },
  cancelButtonText: { color: '#F4F4F4', opacity: 0.3 },
  buttonDisabled: { opacity: 0.5 },
  modalContainer: { flex: 1, backgroundColor: '#1E1E2B' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' },
  modalTitle: { color: '#F4F4F4', fontSize: 18, fontWeight: 'bold' },
  modalContent: { flex: 1, padding: 16 },
  activeResultContainer: { width: '100%', aspectRatio: 1, backgroundColor: '#000', borderRadius: 16, overflow: 'hidden', marginBottom: 20 },
  activeResultImage: { width: '100%', height: '100%' },
  resultActions: { flexDirection: 'row', position: 'absolute', bottom: 16, right: 16, gap: 8 },
  actionIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  historyLabel: { color: 'rgba(244, 244, 244, 0.4)', fontSize: 12, fontWeight: 'bold', marginBottom: 12, textTransform: 'uppercase' },
  galleryGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  galleryItem: { width: (SCREEN_WIDTH - 48) / 3, aspectRatio: 1, borderRadius: 8, overflow: 'hidden', backgroundColor: '#000', marginRight: 8, marginBottom: 8 },
  galleryImage: { width: '100%', height: '100%' },
});
