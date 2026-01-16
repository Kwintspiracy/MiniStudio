import { useState, useEffect } from 'react';
import { fetchActivePrompts } from '../services/promptService';
import { PAINTING_STYLES, DEFAULT_DESIGNER_TEMPLATES, NMM_MIXED_PROMPT } from '../constants';
import { StyleOption, DesignerType } from '../types';

interface PromptsState {
    styles: (StyleOption & { promptPro?: string })[];
    templates: Record<string, { default: string; pro: string }>;
    effects: Record<string, { default: string; pro: string; negative_default?: string; negative_pro?: string }>;
    shareMessage: string;
    exampleAssets: string[]; // URLs
    loading: boolean;
}

export function usePrompts() {
    // Initial state
    const [state, setState] = useState<PromptsState>({
        styles: PAINTING_STYLES,
        templates: Object.keys(DEFAULT_DESIGNER_TEMPLATES).reduce((acc, key) => {
            acc[key] = {
                default: DEFAULT_DESIGNER_TEMPLATES[key as keyof typeof DEFAULT_DESIGNER_TEMPLATES],
                pro: DEFAULT_DESIGNER_TEMPLATES[key as keyof typeof DEFAULT_DESIGNER_TEMPLATES]
            };
            return acc;
        }, {} as Record<string, { default: string; pro: string }>),
        effects: {
            'effect.nmm': {
                default: 'using the Non-Metallic Metal (NMM) technique for all metallic parts',
                pro: 'using the Non-Metallic Metal (NMM) technique for all metallic parts'
            },
            'effect.osl': {
                default: 'Integrate Object Source Lighting (OSL) showing realistic colored light emanating from specific points',
                pro: 'Integrate Object Source Lighting (OSL) showing realistic colored light emanating from specific points'
            },
            'effect.photoshoot': {
                default: 'Rendered as a professional studio product shot with soft diffused lighting on a seamless black background.',
                pro: 'Rendered as a professional studio product shot with soft diffused lighting on a seamless black background.'
            }
        },
        shareMessage: 'Check out this generated miniature from MiniStudio!',
        exampleAssets: [],
        loading: true
    });

    useEffect(() => {
        let isMounted = true;

        async function loadRemoteConfig() {
            const remotePrompts = await fetchActivePrompts();

            if (!isMounted) return;

            // Update Styles
            const updatedStyles = PAINTING_STYLES.map(style => {
                const key = `style.${style.id}`;
                return {
                    ...style,
                    prompt: remotePrompts[key]?.default || style.prompt,
                    promptPro: remotePrompts[key]?.pro || style.prompt
                };
            });

            // Update Templates
            const updatedTemplates: Record<string, { default: string; pro: string }> = {};

            Object.keys(DEFAULT_DESIGNER_TEMPLATES).forEach(key => {
                updatedTemplates[key] = {
                    default: DEFAULT_DESIGNER_TEMPLATES[key as keyof typeof DEFAULT_DESIGNER_TEMPLATES],
                    pro: DEFAULT_DESIGNER_TEMPLATES[key as keyof typeof DEFAULT_DESIGNER_TEMPLATES]
                };
            });

            Object.keys(DEFAULT_DESIGNER_TEMPLATES).forEach(key => {
                const configKey = `template.${key}`;
                if (remotePrompts[configKey]) {
                    updatedTemplates[key] = remotePrompts[configKey];
                }
            });

            // Update Effects
            const updatedEffects = { ...state.effects };
            const newEffects: Record<string, { default: string; pro: string; negative_default?: string; negative_pro?: string }> = {};

            newEffects['effect.nmm'] = remotePrompts['effect.nmm'] ? {
                default: remotePrompts['effect.nmm'].default,
                pro: remotePrompts['effect.nmm'].pro,
                negative_default: remotePrompts['effect.nmm'].negative_default,
                negative_pro: remotePrompts['effect.nmm'].negative_pro
            } : {
                default: 'using the Non-Metallic Metal (NMM) technique for all metallic parts',
                pro: 'using the Non-Metallic Metal (NMM) technique for all metallic parts'
            };

            newEffects['effect.osl'] = remotePrompts['effect.osl'] ? {
                default: remotePrompts['effect.osl'].default,
                pro: remotePrompts['effect.osl'].pro,
                negative_default: remotePrompts['effect.osl'].negative_default,
                negative_pro: remotePrompts['effect.osl'].negative_pro
            } : {
                default: 'Integrate Object Source Lighting (OSL) showing realistic colored light emanating from specific points',
                pro: 'Integrate Object Source Lighting (OSL) showing realistic colored light emanating from specific points'
            };

            newEffects['effect.photoshoot'] = remotePrompts['effect.photoshoot'] ? {
                default: remotePrompts['effect.photoshoot'].default,
                pro: remotePrompts['effect.photoshoot'].pro,
                negative_default: remotePrompts['effect.photoshoot'].negative_default,
                negative_pro: remotePrompts['effect.photoshoot'].negative_pro
            } : {
                default: 'Rendered as a professional studio product shot with soft diffused lighting on a seamless black background.',
                pro: 'Rendered as a professional studio product shot with soft diffused lighting on a seamless black background.'
            };

            newEffects['effect.nmm.mixed'] = remotePrompts['effect.nmm.mixed'] ? {
                default: remotePrompts['effect.nmm.mixed'].default,
                pro: remotePrompts['effect.nmm.mixed'].pro,
                negative_default: remotePrompts['effect.nmm.mixed'].negative_default,
                negative_pro: remotePrompts['effect.nmm.mixed'].negative_pro
            } : {
                default: NMM_MIXED_PROMPT,
                pro: NMM_MIXED_PROMPT
            };

            // Share Message
            const shareMessage = remotePrompts['share.message']?.default || 'Check out this generated miniature from MiniStudio!';

            // Example Assets
            let exampleAssets: string[] = [];
            const assetsConfig = remotePrompts['assets.examples'];
            if (assetsConfig) {
                try {
                    const parsed = JSON.parse(assetsConfig.default);
                    if (parsed.urls && Array.isArray(parsed.urls)) {
                        exampleAssets = parsed.urls;
                    }
                } catch (e) {
                    // ignore
                }
            }

            setState({
                styles: updatedStyles,
                templates: updatedTemplates,
                effects: newEffects,
                shareMessage,
                exampleAssets,
                loading: false
            });
        }

        loadRemoteConfig();

        return () => { isMounted = false; };
    }, []);

    return state;
}
