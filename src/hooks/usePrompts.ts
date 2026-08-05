import { useState, useEffect, useCallback } from 'react';
import { fetchActivePrompts } from '../services/promptService';
import { PAINTING_STYLES, DEFAULT_DESIGNER_TEMPLATES, NMM_MIXED_PROMPT, METALLIC_PAINT_INSTRUCTIONS } from '../constants';
import { StyleOption, DesignerType } from '../types';

interface PromptsState {
    styles: (StyleOption & { promptPro?: string })[];
    templates: Record<string, { default: string; pro: string }>;
    effects: Record<string, { default: string; pro: string; negative_default?: string; negative_pro?: string }>;
    rules: Record<string, { default: string; pro: string }>; // New field
    shareMessage: string;
    exampleAssets: string[]; // URLs
    loading: boolean;
    refetch: () => Promise<void>;
}

export function usePrompts() {
    // Initial state
    const [state, setState] = useState<Omit<PromptsState, 'refetch'>>({
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
            },
            'effect.tmm': {
                default: METALLIC_PAINT_INSTRUCTIONS,
                pro: METALLIC_PAINT_INSTRUCTIONS
            },
            'effect.no-osl': {
                default: '',
                pro: ''
            }
        },
        rules: {
            'rules.paint': { default: '', pro: '' },
            'rules.render': { default: '', pro: '' },
            'rules.sketch': { default: '', pro: '' },
        },
        shareMessage: 'Check out this generated miniature from MiniStudio!',
        exampleAssets: [],
        loading: true
    });

    const loadRemoteConfig = useCallback(async (signal?: AbortSignal) => {
        const remotePrompts = await fetchActivePrompts(signal);

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

            newEffects['effect.tmm'] = remotePrompts['effect.tmm'] ? {
                default: remotePrompts['effect.tmm'].default,
                pro: remotePrompts['effect.tmm'].pro,
                negative_default: remotePrompts['effect.tmm'].negative_default,
                negative_pro: remotePrompts['effect.tmm'].negative_pro
            } : {
                default: METALLIC_PAINT_INSTRUCTIONS,
                pro: METALLIC_PAINT_INSTRUCTIONS
            };

            if (__DEV__) console.log('[usePrompts] effect.no-osl from DB:', remotePrompts['effect.no-osl'] ? `"${remotePrompts['effect.no-osl'].default.substring(0, 60)}"` : 'NOT FOUND');
            newEffects['effect.no-osl'] = remotePrompts['effect.no-osl'] ? {
                default: remotePrompts['effect.no-osl'].default,
                pro: remotePrompts['effect.no-osl'].pro,
                negative_default: remotePrompts['effect.no-osl'].negative_default,
                negative_pro: remotePrompts['effect.no-osl'].negative_pro
            } : {
                default: '',
                pro: ''
            };

            // Update Rules
            const updatedRules: Record<string, { default: string; pro: string }> = {
                'rules.paint': remotePrompts['rules.paint'] || { default: '', pro: '' },
                'rules.render': remotePrompts['rules.render'] || { default: '', pro: '' },
                'rules.sketch': remotePrompts['rules.sketch'] || { default: '', pro: '' },
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
                rules: updatedRules,
                shareMessage,
                exampleAssets,
                loading: false
            });
    }, []);

    useEffect(() => {
        const controller = new AbortController();

        const run = async () => {
            try {
                await loadRemoteConfig(controller.signal);
            } catch (error: any) {
                if (error.name === 'AbortError') return;
            }
        };

        run();

        return () => {
            controller.abort();
        };
    }, [loadRemoteConfig]);

    // Wrap so callers using it as an event handler (onPress/onRefresh, which
    // pass an event object) don't accidentally feed a non-AbortSignal into the
    // query's .abortSignal() and break the fetch.
    const refetch = useCallback(() => loadRemoteConfig(), [loadRemoteConfig]);

    return { ...state, refetch };
}

