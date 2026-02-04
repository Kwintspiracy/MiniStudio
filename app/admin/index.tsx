import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, StyleSheet, Image, Pressable, Alert, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontFamily, borderRadius, spacing } from '../../src/theme';
import { adminFetchAllPrompts, adminCreatePromptVersion, adminActivatePromptVersion, adminUpdatePrompt, PromptConfig, uploadAsset, adminUpdateAssetsList, adminRepairIntegrity } from '../../src/services/promptService';
import * as ImagePicker from 'expo-image-picker';
import { AppModal } from '../../src/components/AppModal';
import { PromptTester } from '../../src/components/admin/PromptTester';
import { PAINTING_STYLES, NMM_MIXED_PROMPT, METALLIC_PAINT_INSTRUCTIONS } from '../../src/constants';
import { 
    adminGetDashboardStats, 
    adminGetUsersList, 
    adminGetTopStyles, 
    adminGetTopTools, 
    adminDeletePrompt,
    DashboardStats,
    UserStats,
    StyleStats,
    ToolStats
} from '../../src/services/adminService';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

// --- Types & Constants ---

type Category = 'Styles' | 'Modes' | 'Effects' | 'Rules' | 'Settings' | 'Tools';
type ViewMode = 'Dashboard' | 'Prompts' | 'Modals' | 'Tools';

const CATEGORY_MAP: Record<string, Category> = {
    'style.': 'Styles',
    'template.': 'Modes',
    'effect.': 'Effects',
    'rules.': 'Rules',
    'share.': 'Settings',
    'assets.': 'Settings',
};

const CATEGORY_ORDER: Category[] = ['Styles', 'Modes', 'Effects', 'Rules', 'Settings', 'Tools'];

export default function AdminDashboard() {
    const [prompts, setPrompts] = useState<PromptConfig[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentView, setCurrentView] = useState<ViewMode>('Dashboard');
    const [selectedKey, setSelectedKey] = useState<string | null>(null);

    const [modalConfig, setModalConfig] = useState<{
        visible: boolean;
        title: string;
        message: string;
        type?: 'default' | 'error' | 'critical';
        primaryAction?: { label: string; onPress: () => void };
        secondaryAction?: { label: string; onPress: () => void };
    }>({ visible: false, title: '', message: '' });
    
    const showModal = (
        title: string, 
        message: string, 
        type: 'default' | 'error' | 'critical' = 'default',
        primaryAction?: { label: string; onPress: () => void },
        secondaryAction?: { label: string; onPress: () => void }
    ) => {
        // If no actions are provided, default to a dismiss button
        const effectivePrimaryAction = primaryAction || (!secondaryAction ? { label: 'OK', onPress: () => {} } : undefined);
        setModalConfig({ visible: true, title, message, type, primaryAction: effectivePrimaryAction, secondaryAction });
    };
    
    const hideModal = () => {
        setModalConfig(prev => ({ ...prev, visible: false }));
    };
    
    // Editor State
    const [isEditing, setIsEditing] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editVersionLabel, setEditVersionLabel] = useState('');
    const [editTemplate, setEditTemplate] = useState('');
    const [editTemplatePro, setEditTemplatePro] = useState('');
    const [editNegativeTemplate, setEditNegativeTemplate] = useState('');
    const [editNegativeTemplatePro, setEditNegativeTemplatePro] = useState('');

    // New Key State
    const [isCreatingKey, setIsCreatingKey] = useState(false);
    const [newKeyName, setNewKeyName] = useState('');

    // Asset Manager State
    const [uploading, setUploading] = useState(false);
    const [assetUrls, setAssetUrls] = useState<string[]>([]);
    const [assetsDirty, setAssetsDirty] = useState(false);

    // Testing State
    const [isTestingScenarios, setIsTestingScenarios] = useState(false);

    // Dashboard Stats
    const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
    const [usersList, setUsersList] = useState<UserStats[]>([]);
    const [topStyles, setTopStyles] = useState<StyleStats[]>([]);
    const [topTools, setTopTools] = useState<ToolStats[]>([]);
    const [statsLoading, setStatsLoading] = useState(false);

    const fetchData = async () => {
        setLoading(true);
        const { data, error } = await adminFetchAllPrompts();
        if (error) {
            showModal('Error', error.message, 'error');
        } else {
            setPrompts(data || []);
        }
        setLoading(false);
    };

    const fetchStats = async () => {
        setStatsLoading(true);
        const [statsRes, usersRes, stylesRes, toolsRes] = await Promise.all([
            adminGetDashboardStats(),
            adminGetUsersList(),
            adminGetTopStyles(),
            adminGetTopTools()
        ]);

        console.log('[Admin Dashboard] Stats Response:', statsRes);
        console.log('[Admin Dashboard] Users Response:', usersRes);
        console.log('[Admin Dashboard] Styles Response:', stylesRes);
        console.log('[Admin Dashboard] Tools Response:', toolsRes);

        if (statsRes.error) {
            console.error('[Admin Dashboard] Stats Error:', statsRes.error);
            showModal('Dashboard Error', `Failed to load stats: ${statsRes.error.message || 'Unknown error'}`, 'error');
        }
        if (usersRes.error) console.error('[Admin Dashboard] Users Error:', usersRes.error);
        if (stylesRes.error) console.error('[Admin Dashboard] Styles Error:', stylesRes.error);
        if (toolsRes.error) console.error('[Admin Dashboard] Tools Error:', toolsRes.error);

        if (statsRes.data) setDashboardStats(statsRes.data);
        if (usersRes.data) setUsersList(usersRes.data);
        if (stylesRes.data) setTopStyles(stylesRes.data);
        if (toolsRes.data) setTopTools(toolsRes.data);
        setStatsLoading(false);
    };

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        if (currentView === 'Dashboard') {
            fetchStats();
        }
    }, [currentView]);

    const handleDeletePrompt = async (id: string) => {
        const { error } = await adminDeletePrompt(id);
        if (error) {
            showModal('Error', error.message, 'error');
        } else {
            await fetchData();
            // Don't deselect key, just refresh list
            hideModal();
        }
    };

    const confirmDelete = (id: string) => {
        showModal(
            'Confirm Delete', 
            'Are you sure you want to delete this version? This cannot be undone.', 
            'critical',
            { label: 'Delete', onPress: () => handleDeletePrompt(id) },
            { label: 'Cancel', onPress: () => {} }
        );
    };

    const handleExportCSVAll = async () => {
        try {
            const header = 'Key,Name,Version,Template,TemplatePro,NegativeTemplate,NegativeTemplatePro,IsActive,CreatedAt\n';
            const rows = prompts.map(p => {
                const escape = (s: string | undefined | null) => `"${(s || '').replace(/"/g, '""')}"`;
                return `${escape(p.key)},${escape(p.name)},${escape(p.version_label)},${escape(p.template)},${escape(p.template_pro)},${escape(p.negative_template)},${escape(p.negative_template_pro)},${p.is_active},${p.created_at}`;
            }).join('\n');
            const csv = header + rows;
            
            const fileUri = (FileSystem as any).documentDirectory + 'mini_studio_prompts_all.csv';
            await FileSystem.writeAsStringAsync(fileUri, csv);
            await Sharing.shareAsync(fileUri);
        } catch (e: any) {
            Alert.alert('Export Failed', e.message);
        }
    };

    const handleExportCSVOne = async () => {
        if (!selectedKey) return;
        const versions = (groupedPrompts[selectedKey] || []);
        try {
            const header = 'Key,Name,Version,Template,TemplatePro,NegativeTemplate,NegativeTemplatePro,IsActive,CreatedAt\n';
            const rows = versions.map((p: any) => {
                const escape = (s: string | undefined | null) => `"${(s || '').replace(/"/g, '""')}"`;
                return `${escape(p.key)},${escape(p.name)},${escape(p.version_label)},${escape(p.template)},${escape(p.template_pro)},${escape(p.negative_template)},${escape(p.negative_template_pro)},${p.is_active},${p.created_at}`;
            }).join('\n');
            const csv = header + rows;
            
            const fileUri = (FileSystem as any).documentDirectory + `mini_studio_${selectedKey.replace(/\./g, '_')}.csv`;
            await FileSystem.writeAsStringAsync(fileUri, csv);
            await Sharing.shareAsync(fileUri);
        } catch (e: any) {
            Alert.alert('Export Failed', e.message);
        }
    };

    const handleRepair = async () => {
        showModal('Repairing Integrity...', 'Working...', 'default');
        const { success, error } = await adminRepairIntegrity();
        hideModal();
        if (error) showModal('Error', error.message, 'error');
        else if (success) {
            Alert.alert('Success', 'Integrity check complete.');
            await fetchData();
        }
    };

    // Grouping & Categorization
    const { groupedPrompts, promptsHierarchy } = useMemo(() => {
        const groups: Record<string, PromptConfig[]> = {};
        
        const HIERARCHY = [
            { 
                label: '/Paint', 
                rulesKey: 'rules.paint',
                sections: [
                    { 
                        label: '//Styles', 
                        keys: ['style.none', 'style.heavy-metal', 'style.grimdark', 'style.slapchop', 'style.craftworld'],
                        labels: { 'style.none': 'None', 'style.heavy-metal': "'Eavy Metal", 'style.grimdark': 'Grimdark', 'style.slapchop': 'Slapchop', 'style.craftworld': 'Craftworld Studio' }
                    },
                    { 
                        label: '//Effects', 
                        keys: ['effect.nmm', 'effect.tmm', 'effect.osl', 'effect.no-osl'],
                        labels: { 'effect.nmm': 'NNM', 'effect.tmm': 'TTM', 'effect.osl': 'OSL', 'effect.no-osl': 'no OSL' }
                    }
                ]
            },
            {
                label: '/Render',
                rulesKey: 'rules.render',
                sections: [
                    {
                        label: '//Effects',
                        keys: ['effect.photoshoot', 'effect.no-photoshoot'],
                        labels: { 'effect.photoshoot': 'Photoshoot', 'effect.no-photoshoot': 'No Photoshoot' }
                    }
                ]
            },
            {
                label: '/Sketches',
                rulesKey: 'rules.sketch',
                sections: [
                    {
                        label: '//Styles',
                        keys: ['style.sketch-fantasy', 'style.sketch-scifi'],
                        labels: { 'style.sketch-fantasy': 'Fantasy', 'style.sketch-scifi': 'Sci-Fi' }
                    },
                    {
                        label: '//Creativity',
                        keys: ['template.creativity_level'],
                        labels: { 'template.creativity_level': 'Creativity levels' }
                    }
                ]
            }
        ];

        prompts.forEach(p => {
            if (!groups[p.key]) groups[p.key] = [];
            groups[p.key].push(p);
        });

        return { groupedPrompts: groups, promptsHierarchy: HIERARCHY };
    }, [prompts]);

    const handleActivate = async (id: string, key: string) => {
        const { error } = await adminActivatePromptVersion(id, key);
        if (error) {
            showModal('Error', error.message, 'error');
        } else {
            await fetchData();
        }
    };

    const handleCreateNewVersion = () => {
        if (!selectedKey) return;
        const versions = groupedPrompts[selectedKey] || [];
        const latest = versions[0];

        setEditingId(null);
        setEditVersionLabel(`v${versions.length + 1}.0`);
        setEditTemplate(latest?.template || '');
        setEditTemplatePro(latest?.template_pro || latest?.template || '');
        setEditNegativeTemplate(latest?.negative_template || '');
        setEditNegativeTemplatePro(latest?.negative_template_pro || latest?.negative_template || '');
        setIsEditing(true);
    };

    const handleEditVersion = (version: PromptConfig) => {
        setEditingId(version.id);
        setEditVersionLabel(version.version_label);
        setEditTemplate(version.template);
        setEditTemplatePro(version.template_pro || version.template);
        setEditNegativeTemplate(version.negative_template || '');
        setEditNegativeTemplatePro(version.negative_template_pro || version.negative_template || '');
        setIsEditing(true);
    };

    const handleSaveVersion = async () => {
        try {
            const keyToUse = isCreatingKey ? newKeyName : selectedKey;
            if (!keyToUse) {
                showModal('Error', 'No Key selected or created', 'error');
                return;
            }

            const versions = groupedPrompts[keyToUse] || [];
            
            // Validate duplicate label
            const isDuplicateLabel = versions.some(v => v.version_label === editVersionLabel && v.id !== editingId);
            if (isDuplicateLabel) {
                showModal('Error', `Version label "${editVersionLabel}" already exists for this key.`, 'error');
                return;
            }

            const latest = versions[0];
            const nameToUse = latest?.name || keyToUse;

            let error;
            if (editingId) {
                const result = await adminUpdatePrompt(editingId, {
                    version_label: editVersionLabel,
                    template: editTemplate,
                    template_pro: editTemplatePro,
                    negative_template: editNegativeTemplate,
                    negative_template_pro: editNegativeTemplatePro,
                    name: nameToUse
                });
                error = result.error;
            } else {
                const result = await adminCreatePromptVersion(
                    keyToUse,
                    nameToUse,
                    editVersionLabel,
                    editTemplate,
                    editTemplatePro,
                    editNegativeTemplate,
                    editNegativeTemplatePro
                );
                error = result.error;
            }

            if (error) {
                showModal('Error', error.message, 'error');
            } else {
                setIsEditing(false);
                setIsCreatingKey(false);
                setEditingId(null);
                if (isCreatingKey) setSelectedKey(keyToUse);
                showModal('Success', 'Version saved successfully', 'default');
                await fetchData();
            }
        } catch (e: any) {
            showModal('Exception', e.message || 'Unknown error occurred', 'error');
        }
    };

    const handlePickAndUpload = async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                quality: 0.8,
            });

            if (!result.canceled) {
                setUploading(true);
                const asset = result.assets[0];
                const fileName = `asset_${Date.now()}.png`;

                const { publicUrl, error: uploadError } = await uploadAsset(asset.uri, fileName);
                if (uploadError || !publicUrl) {
                    showModal('Upload Failed', uploadError?.message || 'Unknown error', 'error');
                    setUploading(false);
                    return;
                }

                const assetKey = 'assets.examples';
                const currentConfig = groupedPrompts[assetKey]?.find(p => p.is_active);
                let currentList: string[] = [];
                if (currentConfig) {
                    try {
                        const parsed = JSON.parse(currentConfig.template);
                        if (parsed.urls && Array.isArray(parsed.urls)) currentList = parsed.urls;
                    } catch (e) {}
                }

                const newList = [...currentList, publicUrl];
                const { error: dbError } = await adminUpdateAssetsList(newList);

                if (dbError) {
                    showModal('Database Update Failed', dbError.message, 'error');
                } else {
                    showModal('Success', 'Asset uploaded and list updated!', 'default');
                    await fetchData();
                }
                setUploading(false);
            }
        } catch (e: any) {
            showModal('Error', e.message, 'error');
            setUploading(false);
        }
    };

    const isAssetKey = selectedKey === 'assets.examples';

    const AdminDashboardView = () => (
        <ScrollView style={styles.main} contentContainerStyle={styles.contentWrapper}>
            <View style={styles.contentHeader}>
                <View>
                    <Text style={styles.breadcrumb}>Admin / Dashboard</Text>
                    <Text style={styles.pageTitle}>Stats Overview</Text>
                </View>
                <TouchableOpacity style={styles.ghSecondaryBtn} onPress={fetchStats}>
                    <Text style={styles.ghSecondaryBtnText}>Refresh Stats</Text>
                </TouchableOpacity>
            </View>

            {statsLoading ? (
                <View style={styles.center}><ActivityIndicator color={GH_COLORS.accent} /></View>
            ) : (
                <>
                    {/* Stats Grid */}
                    <View style={styles.statsGrid}>
                        <View style={styles.statsCard}>
                            <Text style={styles.statsLabel}>Total Users</Text>
                            <Text style={styles.statsValue}>{dashboardStats?.users?.total || 0}</Text>
                        </View>
                        <View style={styles.statsCard}>
                            <Text style={styles.statsLabel}>Accounts (Non-Anon)</Text>
                            <Text style={styles.statsValue}>{dashboardStats?.users?.accounts || 0}</Text>
                        </View>
                        <View style={styles.statsCard}>
                            <Text style={[styles.statsLabel, { color: GH_COLORS.accent }]}>Total Generations</Text>
                            <Text style={styles.statsValue}>{dashboardStats?.generations?.total || 0}</Text>
                        </View>
                    </View>

                    <View style={styles.dashboardRow}>
                        {/* Top Styles */}
                        <View style={[styles.ghCard, { flex: 1, marginRight: 16 }]}>
                            <View style={styles.ghCardHeader}><Text style={styles.ghCardTitle}>Top Styles</Text></View>
                            {topStyles.map((s: StyleStats, i: number) => (
                                <View key={i} style={styles.ghRow}>
                                    <Text style={styles.ghRowTitle}>{s.style_name}</Text>
                                    <Text style={styles.ghRowMeta}>{s.usage_count} generations</Text>
                                </View>
                            ))}
                        </View>

                        {/* Top Tools */}
                        <View style={[styles.ghCard, { flex: 1 }]}>
                            <View style={styles.ghCardHeader}><Text style={styles.ghCardTitle}>Top Tools</Text></View>
                            {topTools.map((t: ToolStats, i: number) => (
                                <View key={i} style={styles.ghRow}>
                                    <Text style={styles.ghRowTitle}>{t.tool_name}</Text>
                                    <Text style={styles.ghRowMeta}>{t.usage_count} uses</Text>
                                </View>
                            ))}
                        </View>
                    </View>

                    {/* Users List */}
                    <View style={[styles.ghCard, { marginTop: 24 }]}>
                        <View style={styles.ghCardHeader}><Text style={styles.ghCardTitle}>Recent Users</Text></View>
                        {usersList.map((u: UserStats, i: number) => (
                            <View key={i} style={styles.ghRow}>
                                <View style={{ flex: 1 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                        <Text style={styles.ghRowTitle}>{u.email || u.id.substring(0, 8)}</Text>
                                        {!u.is_anonymous && <View style={styles.ghPublicBadge}><Text style={styles.ghPublicBadgeText}>ACCOUNT</Text></View>}
                                    </View>
                                    <Text style={styles.ghRowMeta}>ID: {u.id}</Text>
                                </View>
                                <View style={{ alignItems: 'flex-end' }}>
                                    <Text style={styles.ghRowTitle}>{u.generation_count} gens</Text>
                                    <Text style={styles.ghRowMeta}>Last: {u.last_generation_at ? new Date(u.last_generation_at).toLocaleDateString() : 'Never'}</Text>
                                </View>
                            </View>
                        ))}
                    </View>
                </>
            )}
        </ScrollView>
    );

    const ModalRegistryView = () => {
        const MODAL_LIST = [
            { id: 'app_modal', name: 'Global AppModal', title: 'Varies', text: 'Base component for alerts. Content is passed dynamically via showModal() props.', buttons: ['OK', 'Cancel'], file: 'src/components/AppModal.tsx' },
            { id: 'paywall', name: 'Paywall Drawer', title: 'Keep building your perfect paint plan.', text: 'Displays subscription options: 12 Months ($4.49/mo), Monthly ($5.99/mo), and 200 Tokens Pack ($17.99).', buttons: ['Subscribe', 'Restore'], file: 'src/components/PaywallDrawer.tsx' },
            { id: 'feedback', name: 'Feedback Drawer', title: 'Send Feedback', text: 'We’d love to hear from you! Send us your thoughts, bug reports, or feature requests.', buttons: ['Send Feedback', 'Cancel'], file: 'src/components/FeedbackDrawer.tsx' },
            { id: 'paint_explorer', name: 'Paint Explorer', title: 'Paint Explorer', text: 'Browse and select paints from major brands like Vallejo, Citadel, and Army Painter.', buttons: ['Done'], file: 'src/components/PaintExplorerModal.tsx' },
            { id: 'welcome_onboarding', name: 'Welcome Onboarding', title: 'Welcome to MiniPainter Studio', text: 'Everything you need to plan a great paint job before you pick up a brush.', buttons: ['Start the tour', 'Next', 'Finish'], file: 'src/components/WelcomeOnboarding.tsx' },
            { id: 'onboarding_overlay', name: 'Tutorial Overlay', title: 'Welcome to MiniStudio', text: 'Let’s create your first miniature! Follow the guide to generate stunning concept art.', buttons: ['Let’s Go', 'Got it'], file: 'src/components/OnboardingOverlay.tsx' },
            { id: 'google_overloaded', name: 'Google Servers Overloaded', title: 'Google Servers Overloaded', text: 'The AI model is currently at capacity. Please try again in a moment.', buttons: ['Retry', 'Cancel'], file: 'app/(studio)/index.tsx' },
            { id: 'limit_reached', name: 'Limit Reached', title: 'Limit Reached', text: 'You’ve used all your 60 tokens for this month. You can always get a token Pack if you are in a hurry.', buttons: ['Get Tokens', 'Maybe Later'], file: 'app/(studio)/index.tsx' },
            { id: 'tokens_exhausted', name: 'Tokens Exhausted', title: 'Tokens Exhausted', text: 'You’ve used all your tokens. Subscribe or get a Pack to keep creating!', buttons: ['Get Tokens', 'Maybe Later'], file: 'app/(studio)/index.tsx' },
            { id: 'gen_failed', name: 'Generation Failed', title: 'Generation Failed', text: '[Error Message Details]', buttons: ['OK'], file: 'app/(studio)/index.tsx' },
            { id: 'confirm_cancel', name: 'Confirm Cancel', title: 'Confirm Cancel?', text: 'Image generation usually takes around 30 seconds. Are you sure you want to stop now?', buttons: ['Confirm', 'Wait'], file: 'app/(studio)/index.tsx' },
            { id: 'delete_confirm', name: 'Delete Items', title: 'Delete Items', text: 'Are you sure you want to delete [X] items?', buttons: ['Delete', 'Cancel'], file: 'app/(studio)/index.tsx' },
            { id: 'gallery_full', name: 'Gallery Full', title: 'Gallery Full', text: 'You’ve reached the 10-image limit for guest users. Sign in to keep unlimited images and never lose your creations!', buttons: ['Sign In', 'Maybe Later'], file: 'app/(studio)/index.tsx' },
            { id: 'save_creations', name: 'Save Creations', title: 'Save your creations!', text: 'Create a free account in under a minute to save your images.', buttons: ['Sign In', 'Not now'], file: 'app/(studio)/index.tsx' },
            { id: 'account_created', name: 'Account Created', title: 'Account Created', text: 'We’ve sent a confirmation email to [email]. (Note: If this email is already registered, you may not receive a new confirmation link).', buttons: ['OK'], file: 'app/signin.tsx' },
            { id: 'password_success', name: 'Password Updated', title: 'Success', text: 'Your password has been updated. You can now sign in with your new password.', buttons: ['OK'], file: 'app/update-password.tsx' },
            { id: 'sign_out', name: 'Sign Out Confirm', title: 'Sign Out', text: 'Are you sure you want to sign out of your account?', buttons: ['Sign Out', 'Cancel'], file: 'app/settings.tsx' },
        ];

        return (
            <ScrollView style={styles.main} contentContainerStyle={styles.contentWrapper}>
                <View style={styles.contentHeader}>
                <View>
                    <Text style={styles.breadcrumb}>Admin / Modals</Text>
                    <Text style={styles.pageTitle}>Modal Registry</Text>
                </View>
                </View>

                <View style={styles.ghCard}>
                    <View style={styles.ghCardHeader}>
                        <Text style={styles.ghCardTitle}>Registered Application Modals</Text>
                        <Text style={styles.ghCardCount}>{MODAL_LIST.length} Modals</Text>
                    </View>
                    {MODAL_LIST.map(m => (
                        <View key={m.id} style={styles.ghRow}>
                            <View style={{ flex: 1 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                    <Text style={styles.ghRowTitle}>{m.title}</Text>
                                    <View style={{ backgroundColor: GH_COLORS.border, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                        <Text style={{ color: GH_COLORS.textSecondary, fontSize: 10, fontFamily: 'monospace' }}>{m.id}</Text>
                                    </View>
                                </View>
                                <Text style={[styles.ghRowMeta, { color: GH_COLORS.textPrimary, marginBottom: 8 }]}>{m.text}</Text>
                                {m.buttons && (
                                    <View style={{ flexDirection: 'row', gap: 6 }}>
                                        {m.buttons.map((btn, idx) => (
                                            <View key={idx} style={styles.ghPublicBadge}>
                                                <Text style={styles.ghPublicBadgeText}>{btn}</Text>
                                            </View>
                                        ))}
                                    </View>
                                )}
                            </View>
                            <View style={{ alignItems: 'flex-end', justifyContent: 'center', marginLeft: 16 }}>
                                <Text style={[styles.ghRowMeta, { fontFamily: 'monospace', fontSize: 10 }]}>{m.file}</Text>
                                <Text style={[styles.ghRowMeta, { color: GH_COLORS.accent, fontSize: 10 }]}>{m.name}</Text>
                            </View>
                        </View>
                    ))}
                </View>
            </ScrollView>
        );
    };

    useEffect(() => {
        if (isAssetKey) {
            const config = groupedPrompts['assets.examples']?.find(p => p.is_active);
            if (config) {
                try {
                    const parsed = JSON.parse(config.template);
                    if (parsed.urls && Array.isArray(parsed.urls)) {
                        setAssetUrls(parsed.urls);
                        setAssetsDirty(false);
                    }
                } catch (e) {
                    setAssetUrls([]);
                }
            } else {
                setAssetUrls([]);
            }
        }
    }, [isAssetKey, groupedPrompts]);

    const moveAssetUp = (index: number) => {
        if (index <= 0) return;
        const newUrls = [...assetUrls];
        [newUrls[index - 1], newUrls[index]] = [newUrls[index], newUrls[index - 1]];
        setAssetUrls(newUrls);
        setAssetsDirty(true);
    };

    const moveAssetDown = (index: number) => {
        if (index >= assetUrls.length - 1) return;
        const newUrls = [...assetUrls];
        [newUrls[index], newUrls[index + 1]] = [newUrls[index + 1], newUrls[index]];
        setAssetUrls(newUrls);
        setAssetsDirty(true);
    };

    const deleteAsset = (index: number) => {
        const newUrls = assetUrls.filter((_, i) => i !== index);
        setAssetUrls(newUrls);
        setAssetsDirty(true);
    };

    const saveAssetOrder = async () => {
        const { error } = await adminUpdateAssetsList(assetUrls);
        if (error) {
            showModal('Error', error.message, 'error');
        } else {
            showModal('Success', 'Asset order saved!', 'default');
            setAssetsDirty(false);
            await fetchData();
        }
    };

    const addNewAsset = async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                quality: 0.8,
            });

            if (!result.canceled) {
                setUploading(true);
                const asset = result.assets[0];
                const fileName = `asset_${Date.now()}.png`;

                const { publicUrl, error: uploadError } = await uploadAsset(asset.uri, fileName);
                if (uploadError || !publicUrl) {
                    showModal('Upload Failed', uploadError?.message || 'Unknown error', 'error');
                    setUploading(false);
                    return;
                }

                const newUrls = [...assetUrls, publicUrl];
                const { error: dbError } = await adminUpdateAssetsList(newUrls);
                if (dbError) {
                    showModal('Database Update Failed', dbError.message, 'error');
                } else {
                    setAssetUrls(newUrls);
                    showModal('Success', 'Asset uploaded!', 'default');
                    await fetchData();
                }
                setUploading(false);
            }
        } catch (e: any) {
            showModal('Error', e.message, 'error');
            setUploading(false);
        }
    };

    if (loading && prompts.length === 0) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color={colors.button.primary} />
            </View>
        );
    }

    const selectedVersions = selectedKey ? (groupedPrompts[selectedKey] || []) : [];

    return (
        <View style={styles.outerContainer}>
            {/* GitHub Global Header */}
            <View style={styles.ghHeader}>
                <View style={styles.ghHeaderLeft}>
                    <View style={styles.ghLogo}>
                        <Text style={styles.ghLogoText}>MS</Text>
                    </View>
                    <View style={styles.ghBreadcrumbs}>
                        <Text style={styles.ghOrg}>MiniStudio</Text>
                        <Text style={styles.ghDivider}>/</Text>
                        <Text style={styles.ghRepo}>Prompt-Registry</Text>
                        <View style={styles.ghPublicBadge}>
                            <Text style={styles.ghPublicBadgeText}>Public</Text>
                        </View>
                    </View>
                </View>
                <View style={styles.ghHeaderRight}>
                   <TouchableOpacity style={styles.ghHeaderIcon}>
                       <Text style={styles.ghIconText}>🔔</Text>
                   </TouchableOpacity>
                   <View style={styles.ghAvatar} />
                </View>
            </View>

            {/* Horizontal Tabs */}
            <View style={styles.ghTabs}>
                {(['Dashboard', 'Prompts', 'Modals', 'Tools'] as ViewMode[]).map(v => (
                    <TouchableOpacity 
                        key={v}
                        style={[styles.ghTab, currentView === v && styles.ghTabActive]}
                        onPress={() => {
                            setCurrentView(v);
                            if (v !== 'Prompts') setSelectedKey(null);
                            if (v !== 'Tools') setIsTestingScenarios(false);
                            else setIsTestingScenarios(true);
                        }}
                    >
                        <Text style={[styles.ghTabText, currentView === v && styles.ghTabTextActive]}>
                            {v === 'Dashboard' ? '📊 Dashboard' : 
                             v === 'Prompts' ? '⚙️ Prompts' : 
                             v === 'Modals' ? '📦 Modals' : 
                             '🧪 Testing'}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            <View style={styles.container}>
                {/* Sidebar - GitHub Settings Style */}
                {(currentView === 'Prompts' && !isTestingScenarios) && (
                    <View style={styles.sidebar}>
                        <View style={styles.sidebarTitleRow}>
                            <Text style={styles.sidebarHeaderTitle}>Edit Registry</Text>
                            <TouchableOpacity 
                                style={styles.ghAddBtn}
                                onPress={() => {
                                    setIsCreatingKey(true);
                                    setIsEditing(true);
                                    setSelectedKey(null);
                                    setEditingId(null);
                                    setNewKeyName('');
                                    setEditVersionLabel('v1.0');
                                    setEditTemplate('');
                                    setEditTemplatePro('');
                                }}
                            >
                                <Text style={styles.ghAddBtnText}>New Key</Text>
                            </TouchableOpacity>
                        </View>
                        
                        <ScrollView style={styles.navigation} showsVerticalScrollIndicator={false}>
                            {promptsHierarchy.map((main) => (
                                <View key={main.label} style={styles.navSection}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingHorizontal: 8 }}>
                                        <Text style={[styles.sectionTitle, { marginBottom: 0, paddingHorizontal: 0, fontSize: 13, color: GH_COLORS.textPrimary }]}>{main.label}</Text>
                                        <TouchableOpacity 
                                            style={styles.ghSecondaryBtnSmall}
                                            onPress={() => {
                                                setSelectedKey(main.rulesKey);
                                                setIsEditing(false);
                                                setIsTestingScenarios(false);
                                                // If rule doesn't exist, this will show empty state which is fine, 
                                                // or we could force create version if empty.
                                            }}
                                        >
                                            <Text style={styles.ghSecondaryBtnTextSmall}>+ Rules</Text>
                                        </TouchableOpacity>
                                    </View>
                                    
                                    {main.sections.map(section => (
                                        <View key={section.label} style={{ marginBottom: 12 }}>
                                            <Text style={[styles.sectionTitle, { fontSize: 11, opacity: 0.7 }]}>{section.label}</Text>
                                            {section.keys.map(key => {
                                                const isActive = selectedKey === key && !isTestingScenarios;
                                                const label = (section.labels as any)[key] || key;
                                                return (
                                                    <TouchableOpacity
                                                        key={key}
                                                        onPress={() => { setSelectedKey(key); setIsEditing(false); setIsTestingScenarios(false); }}
                                                        style={[styles.navItem, isActive && styles.navItemActive, { paddingLeft: 20 }]}
                                                    >
                                                        <Text style={[styles.navItemText, isActive && styles.navItemTextActive, { fontSize: 13 }]} numberOfLines={1}>
                                                            {label}
                                                        </Text>
                                                        {groupedPrompts[key]?.filter(v => v.is_active).length > 1 && <Text style={{ color: GH_COLORS.danger, fontSize: 10 }}> ⚠️</Text>}
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </View>
                                    ))}
                                </View>
                            ))}
                        </ScrollView>
                    </View>
                )}

                {/* Main Content Area */}
                <View style={styles.main}>
                    {currentView === 'Dashboard' ? (
                        <AdminDashboardView />
                    ) : currentView === 'Modals' ? (
                        <ModalRegistryView />
                    ) : currentView === 'Tools' ? (
                        <View style={{ flex: 1, padding: 32 }}>
                             <PromptTester 
                                stylesList={PAINTING_STYLES.map(s => {
                                    const config = groupedPrompts[`style.${s.id}`]?.find(p => p.is_active);
                                    return { ...s, prompt: config?.template || s.prompt, promptPro: config?.template_pro || s.prompt };
                                })}
                                effectsList={{
                                    'effect.nmm': groupedPrompts['effect.nmm']?.find(p => p.is_active) || { default: '', pro: '' },
                                    'effect.tmm': groupedPrompts['effect.tmm']?.find(p => p.is_active) || { default: METALLIC_PAINT_INSTRUCTIONS, pro: METALLIC_PAINT_INSTRUCTIONS },
                                    'effect.osl': groupedPrompts['effect.osl']?.find(p => p.is_active) || { default: '', pro: '' },
                                    'effect.photoshoot': groupedPrompts['effect.photoshoot']?.find(p => p.is_active) || { default: '', pro: '' },
                                    'effect.nmm.mixed': groupedPrompts['effect.nmm.mixed']?.find(p => p.is_active) || { default: NMM_MIXED_PROMPT, pro: NMM_MIXED_PROMPT }
                                }}
                            />
                        </View>
                    ) : (selectedKey || isCreatingKey) ? (
                        <View style={styles.contentWrapper}>
                            <View style={styles.contentHeader}>
                                <View style={{ flex: 1 }}>
                                    <View style={styles.ghMainTitleRow}>
                                        <Text style={styles.mainTitle}>{isCreatingKey ? 'Create New Prompt' : (groupedPrompts[selectedKey!]?.[0]?.name || selectedKey)}</Text>
                                        {!isCreatingKey && (
                                            <View style={styles.ghStatusBadge}>
                                                <Text style={styles.ghStatusBadgeText}>Live</Text>
                                            </View>
                                        )}
                                    </View>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                        <Text style={styles.breadcrumb}>Admin / Prompts / {selectedKey?.split('.')[0] || 'New'}</Text>
                                    </View>
                                    <Text style={styles.mainSubtitle}>{isCreatingKey ? 'Specify the logic for a new prompt category or effect' : `Key: ${selectedKey}`}</Text>
                                </View>
                                {!isEditing && (
                                    <TouchableOpacity style={styles.ghPrimaryBtn} onPress={handleCreateNewVersion}>
                                        <Text style={styles.ghPrimaryBtnText}>Create version</Text>
                                    </TouchableOpacity>
                                )}
                            </View>

                            {isEditing ? (
                                <ScrollView style={styles.editorScroll} showsVerticalScrollIndicator={true}>
                                    <View style={styles.ghEditorBox}>
                                        <View style={styles.ghEditorHeader}>
                                            <Text style={styles.ghEditorHeaderText}>Configuration Editor</Text>
                                        </View>
                                        
                                        <View style={styles.ghEditorBody}>
                                            {isCreatingKey && (
                                                <View style={styles.field}>
                                                    <Text style={styles.fieldLabel}>Key Identifier <Text style={styles.ghRequired}>*</Text></Text>
                                                    <TextInput
                                                        style={styles.textInput}
                                                        value={newKeyName}
                                                        onChangeText={setNewKeyName}
                                                        placeholder="e.g. style.grimdark"
                                                        placeholderTextColor={GH_COLORS.textSecondary}
                                                    />
                                                    <Text style={styles.ghHelpText}>Use dots for namespaces (e.g., style, effect, rules)</Text>
                                                </View>
                                            )}

                                            <View style={styles.field}>
                                                <Text style={styles.fieldLabel}>Version Label</Text>
                                                <TextInput
                                                    style={styles.textInput}
                                                    value={editVersionLabel}
                                                    onChangeText={setEditVersionLabel}
                                                />
                                            </View>

                                            <View style={styles.field}>
                                                <Text style={styles.fieldLabel}>Basic Prompt Template</Text>
                                                <TextInput
                                                    style={[styles.textInput, styles.multiLineInput]}
                                                    value={editTemplate}
                                                    onChangeText={setEditTemplate}
                                                    multiline
                                                />
                                            </View>

                                            <View style={styles.field}>
                                                <Text style={[styles.fieldLabel, { color: GH_COLORS.accent }]}>PRO Prompt Template</Text>
                                                <TextInput
                                                    style={[styles.textInput, styles.multiLineInput]}
                                                    value={editTemplatePro}
                                                    onChangeText={setEditTemplatePro}
                                                    multiline
                                                />
                                            </View>

                                            <View style={styles.editorFooter}>
                                                <TouchableOpacity style={styles.ghSecondaryBtn} onPress={() => setIsEditing(false)}>
                                                    <Text style={styles.ghSecondaryBtnText}>Cancel</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity style={styles.ghPrimaryBtn} onPress={handleSaveVersion}>
                                                    <Text style={styles.ghPrimaryBtnText}>Commit changes</Text>
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    </View>
                                </ScrollView>
                            ) : isAssetKey ? (
                                /* Asset Library GitHub Style */
                                <ScrollView style={styles.scrollContent}>
                                    <View style={styles.ghAssetHeader}>
                                        <Text style={styles.ghAssetTitle}>Example Assets</Text>
                                        <TouchableOpacity style={styles.ghSecondaryBtn} onPress={addNewAsset} disabled={uploading}>
                                            <Text style={styles.ghSecondaryBtnText}>{uploading ? 'Uploading...' : 'Upload asset'}</Text>
                                        </TouchableOpacity>
                                    </View>
                                    
                                    <View style={styles.grid}>
                                        {assetUrls.map((url, index) => (
                                            <View key={url} style={styles.assetCard}>
                                                <Image source={{ uri: url }} style={styles.assetImage} />
                                                <View style={styles.ghAssetFooter}>
                                                    <TouchableOpacity onPress={() => deleteAsset(index)} style={styles.ghDeleteIcon}>
                                                        <Text style={{color: GH_COLORS.danger, fontSize: 12}}>🗑</Text>
                                                    </TouchableOpacity>
                                                </View>
                                            </View>
                                        ))}
                                    </View>
                                    {assetsDirty && (
                                        <TouchableOpacity style={[styles.ghPrimaryBtn, { marginTop: 24, alignSelf: 'flex-start' }]} onPress={saveAssetOrder}>
                                            <Text style={styles.ghPrimaryBtnText}>Save asset order</Text>
                                        </TouchableOpacity>
                                    )}
                                </ScrollView>
                            ) : (
                                /* Deployment History 스타일 */
                                <ScrollView style={styles.scrollContent}>
                                    <View style={styles.ghHistoryHeader}>
                                        <Text style={styles.ghHistoryTitle}>Version History</Text>
                                        <Text style={styles.ghHistoryCount}>{selectedVersions.length} deployments</Text>
                                    </View>
                                    
                                    {selectedVersions.map((version) => (
                                        <View key={version.id} style={[styles.vCard, version.is_active && styles.vCardActive]}>
                                            <View style={styles.vHeader}>
                                                <View style={styles.ghVersionInfo}>
                                                    <Text style={styles.vLabel}>{version.version_label}</Text>
                                                    <Text style={styles.ghCommitHash}>#{version.id.split('-')[0]}</Text>
                                                    {version.is_active && (
                                                        <View style={styles.ghLiveBadge}>
                                                            <View style={styles.ghLiveDot} />
                                                            <Text style={styles.ghLiveText}>Active</Text>
                                                        </View>
                                                    )}
                                                </View>
                                                <View style={styles.vActions}>
                                                    {!version.is_active && (
                                                        <TouchableOpacity style={styles.ghSecondaryBtnSmall} onPress={() => handleActivate(version.id, version.key)}>
                                                            <Text style={styles.ghSecondaryBtnTextSmall}>Activate</Text>
                                                        </TouchableOpacity>
                                                    )}
                                                    <TouchableOpacity style={styles.ghSecondaryBtnSmall} onPress={() => handleEditVersion(version)}>
                                                        <Text style={styles.ghSecondaryBtnTextSmall}>Edit</Text>
                                                    </TouchableOpacity>
                                                    <TouchableOpacity 
                                                        style={[styles.ghSecondaryBtnSmall, { borderColor: GH_COLORS.danger }]} 
                                                        onPress={() => confirmDelete(version.id)}
                                                    >
                                                        <Text style={[styles.ghSecondaryBtnTextSmall, { color: GH_COLORS.danger }]}>Delete</Text>
                                                    </TouchableOpacity>
                                                </View>
                                            </View>
                                            
                                            <Text style={styles.ghTimestamp}>Deployed on {new Date(version.created_at).toLocaleDateString()} {new Date(version.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>

                                            <View style={styles.ghPromptBox}>
                                                <Text style={styles.ghPromptLabel}>BASIC</Text>
                                                <Text style={styles.ghPromptText} numberOfLines={2}>{version.template || '(No prompt)'}</Text>
                                            </View>
                                        </View>
                                    ))}
                                </ScrollView>
                            )}
                        </View>
                    ) : (
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyIcon}>📂</Text>
                            <Text style={styles.ghEmptyTitle}>Select a prompt to begin</Text>
                            <Text style={styles.ghEmptyText}>Select an aesthetic style or mode effect from the navigation to manage prompts and deployments.</Text>
                        </View>
                    )}
                </View>
            </View>

            <AppModal
                visible={modalConfig.visible}
                onClose={hideModal}
                title={modalConfig.title}
                message={modalConfig.message}
                type={modalConfig.type}
                primaryAction={modalConfig.primaryAction ? {
                    label: modalConfig.primaryAction.label || "OK",
                    onPress: () => { modalConfig.primaryAction?.onPress(); hideModal(); }
                } : undefined}
                secondaryAction={modalConfig.secondaryAction ? {
                    label: modalConfig.secondaryAction.label || "Cancel",
                    onPress: () => { modalConfig.secondaryAction?.onPress(); hideModal(); }
                } : undefined}
            />
        </View>
    );
}

const GH_COLORS = {
    canvas: '#0D1117',
    sidebar: '#010409',
    border: '#30363D',
    textPrimary: '#C9D1D9',
    textSecondary: '#8B949E',
    accent: '#58A6FF',
    success: '#238636',
    danger: '#F85149',
    itemHover: '#161B22',
    itemActive: '#1F6FEB',
    card: '#0D1117',
};

const styles = StyleSheet.create({
    outerContainer: { flex: 1, backgroundColor: GH_COLORS.canvas },
    container: { flex: 1, flexDirection: 'row', backgroundColor: GH_COLORS.canvas },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    
    // GitHub Global Header
    ghHeader: { 
        height: 60, 
        backgroundColor: GH_COLORS.sidebar, 
        flexDirection: 'row', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        paddingHorizontal: 24,
        borderBottomWidth: 1,
        borderBottomColor: GH_COLORS.border
    },
    ghHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    ghLogo: { width: 32, height: 32, borderRadius: 6, backgroundColor: GH_COLORS.border, justifyContent: 'center', alignItems: 'center' },
    ghLogoText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
    ghBreadcrumbs: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    ghOrg: { color: GH_COLORS.accent, fontSize: 14, fontWeight: '600' },
    ghDivider: { color: GH_COLORS.textSecondary, fontSize: 14 },
    ghRepo: { color: GH_COLORS.textPrimary, fontSize: 14, fontWeight: '600' },
    ghPublicBadge: { borderWidth: 1, borderColor: GH_COLORS.border, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
    ghPublicBadgeText: { color: GH_COLORS.textSecondary, fontSize: 11, fontWeight: '500' },
    ghHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    ghHeaderIcon: { padding: 4 },
    ghIconText: { fontSize: 16 },
    ghAvatar: { width: 20, height: 20, borderRadius: 10, backgroundColor: GH_COLORS.border },

    // Tabs
    ghTabs: { 
        flexDirection: 'row', 
        paddingHorizontal: 24, 
        backgroundColor: GH_COLORS.sidebar,
        borderBottomWidth: 1,
        borderBottomColor: GH_COLORS.border
    },
    ghTab: { paddingVertical: 12, paddingHorizontal: 16, marginBottom: -1, borderBottomWidth: 2, borderBottomColor: 'transparent' },
    ghTabActive: { borderBottomColor: '#f78166' },
    ghTabText: { color: GH_COLORS.textPrimary, fontSize: 14 },
    ghTabTextActive: { fontWeight: '600' },

    // Sidebar
    sidebar: { width: 280, backgroundColor: GH_COLORS.canvas, borderRightWidth: 1, borderRightColor: GH_COLORS.border, padding: 24 },
    sidebarTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    sidebarHeaderTitle: { fontSize: 14, fontWeight: '600', color: GH_COLORS.textPrimary },
    ghAddBtn: { backgroundColor: GH_COLORS.success, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6 },
    ghAddBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
    navigation: { flex: 1 },
    navSection: { marginBottom: 24 },
    sectionTitle: { fontSize: 12, fontWeight: '600', color: GH_COLORS.textSecondary, marginBottom: 8, paddingHorizontal: 8 },
    navItem: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6, marginBottom: 2 },
    navItemActive: { backgroundColor: '#21262d' },
    navItemText: { color: GH_COLORS.textPrimary, fontSize: 14, fontWeight: '400' },
    navItemTextActive: { fontWeight: '600' },
    ghNavPlaceholder: { padding: 8, marginHorizontal: 8, borderRadius: 6, borderStyle: 'dotted', borderWidth: 1, borderColor: GH_COLORS.border },
    ghNavPlaceholderText: { color: GH_COLORS.textSecondary, fontSize: 12 },

    // Main Content
    main: { flex: 1, backgroundColor: GH_COLORS.canvas },
    contentWrapper: { flex: 1, padding: 32 },
    contentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: GH_COLORS.border },
    ghMainTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
    mainTitle: { fontSize: 24, fontWeight: '600', color: GH_COLORS.textPrimary },
    ghStatusBadge: { backgroundColor: 'rgba(35, 134, 54, 0.1)', borderWidth: 1, borderColor: GH_COLORS.success, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
    ghStatusBadgeText: { color: '#3fb950', fontSize: 12, fontWeight: '600' },
    mainSubtitle: { fontSize: 14, color: GH_COLORS.textSecondary },
    ghPrimaryBtn: { backgroundColor: GH_COLORS.success, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(240,246,252,0.1)' },
    ghPrimaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
    ghSecondaryBtn: { backgroundColor: '#21262d', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: GH_COLORS.border },
    ghSecondaryBtnText: { color: GH_COLORS.textPrimary, fontSize: 14, fontWeight: '600' },
    ghSecondaryBtnSmall: { backgroundColor: '#21262d', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: GH_COLORS.border },
    ghSecondaryBtnTextSmall: { color: GH_COLORS.textPrimary, fontSize: 12, fontWeight: '600' },

    // Editor
    editorScroll: { flex: 1 },
    ghEditorBox: { backgroundColor: GH_COLORS.sidebar, borderRadius: 6, borderWidth: 1, borderColor: GH_COLORS.border, overflow: 'hidden' },
    ghEditorHeader: { backgroundColor: '#161b22', padding: 12, borderBottomWidth: 1, borderBottomColor: GH_COLORS.border },
    ghEditorHeaderText: { color: GH_COLORS.textPrimary, fontSize: 14, fontWeight: '600' },
    ghEditorBody: { padding: 24, backgroundColor: GH_COLORS.canvas },
    field: { marginBottom: 24 },
    fieldLabel: { fontSize: 14, fontWeight: '600', color: GH_COLORS.textPrimary, marginBottom: 8 },
    ghRequired: { color: GH_COLORS.danger },
    ghHelpText: { fontSize: 12, color: GH_COLORS.textSecondary, marginTop: 4 },
    textInput: { backgroundColor: '#0d1117', borderWidth: 1, borderColor: GH_COLORS.border, color: GH_COLORS.textPrimary, padding: 12, borderRadius: 6, fontSize: 14 },
    multiLineInput: { height: 160, textAlignVertical: 'top', fontFamily: 'monospace' },
    editorFooter: { flexDirection: 'row', justifyContent: 'flex-start', gap: 12, marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: GH_COLORS.border },

    // Asset Library
    ghAssetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
    ghAssetTitle: { fontSize: 16, fontWeight: '600', color: GH_COLORS.textPrimary },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    assetCard: { width: 140, height: 140, borderRadius: 6, borderWidth: 1, borderColor: GH_COLORS.border, overflow: 'hidden', backgroundColor: '#161b22' },
    assetImage: { width: '100%', height: '100%' },
    ghAssetFooter: { position: 'absolute', bottom: 4, right: 4 },
    ghDeleteIcon: { backgroundColor: '#21262d', padding: 6, borderRadius: 6, borderWidth: 1, borderColor: GH_COLORS.border },

    // Version History
    scrollContent: { flex: 1 },
    ghHistoryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    ghHistoryTitle: { fontSize: 16, fontWeight: '600', color: GH_COLORS.textPrimary },
    ghHistoryCount: { fontSize: 12, color: GH_COLORS.textSecondary },
    vCard: { backgroundColor: GH_COLORS.canvas, borderRadius: 6, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: GH_COLORS.border },
    vCardActive: { borderColor: GH_COLORS.border, backgroundColor: '#161b22' },
    vHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
    ghVersionInfo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    vLabel: { fontSize: 14, fontWeight: '600', color: GH_COLORS.accent },
    ghCommitHash: { fontSize: 12, color: GH_COLORS.textSecondary, fontFamily: 'monospace' },
    ghLiveBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(56, 139, 253, 0.1)', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(56, 139, 253, 0.4)' },
    ghLiveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: GH_COLORS.accent },
    ghLiveText: { color: GH_COLORS.accent, fontSize: 10, fontWeight: '600' },
    vActions: { flexDirection: 'row', gap: 6 },
    ghTimestamp: { fontSize: 12, color: GH_COLORS.textSecondary, marginBottom: 12 },
    ghPromptBox: { backgroundColor: '#0d1117', padding: 12, borderRadius: 6, borderWidth: 1, borderColor: GH_COLORS.border },
    ghPromptLabel: { fontSize: 10, fontWeight: '700', color: GH_COLORS.textSecondary, marginBottom: 4 },
    ghPromptText: { color: GH_COLORS.textPrimary, fontSize: 13, fontFamily: 'monospace', lineHeight: 18 },

    emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 64 },
    emptyIcon: { fontSize: 40, marginBottom: 16, opacity: 0.5 },
    ghEmptyTitle: { fontSize: 20, fontWeight: '600', color: GH_COLORS.textPrimary, marginBottom: 8 },
    ghEmptyText: { fontSize: 14, color: GH_COLORS.textSecondary, textAlign: 'center', lineHeight: 22, maxWidth: 360 },

    // Analytics & Extras
    breadcrumb: { fontSize: 12, color: GH_COLORS.textSecondary, marginBottom: 4 },
    pageTitle: { fontSize: 24, fontWeight: '700', color: GH_COLORS.textPrimary },
    statsGrid: { flexDirection: 'row', gap: 16, marginBottom: 24 },
    statsCard: { flex: 1, backgroundColor: GH_COLORS.sidebar, padding: 20, borderRadius: 8, borderWidth: 1, borderColor: GH_COLORS.border },
    statsLabel: { fontSize: 12, fontWeight: '600', color: GH_COLORS.textSecondary, marginBottom: 8 },
    statsValue: { fontSize: 28, fontWeight: '700', color: GH_COLORS.textPrimary },
    dashboardRow: { flexDirection: 'row', gap: 16 },
    ghCard: { backgroundColor: GH_COLORS.sidebar, borderRadius: 8, borderWidth: 1, borderColor: GH_COLORS.border, overflow: 'hidden' },
    ghCardHeader: { padding: 16, backgroundColor: '#161B22', borderBottomWidth: 1, borderBottomColor: GH_COLORS.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    ghCardTitle: { fontSize: 14, fontWeight: '600', color: GH_COLORS.textPrimary },
    ghCardCount: { fontSize: 12, color: GH_COLORS.textSecondary },
    ghRow: { padding: 16, borderBottomWidth: 1, borderBottomColor: GH_COLORS.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    ghRowTitle: { fontSize: 14, fontWeight: '600', color: GH_COLORS.textPrimary },
    ghRowMeta: { fontSize: 12, color: GH_COLORS.textSecondary, marginTop: 2 },
});

