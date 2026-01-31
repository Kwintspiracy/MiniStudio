import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, StyleSheet, Image, Pressable } from 'react-native';
import { colors, fontFamily, borderRadius, spacing } from '../../src/theme';
import { adminFetchAllPrompts, adminCreatePromptVersion, adminActivatePromptVersion, adminUpdatePrompt, PromptConfig, uploadAsset, adminUpdateAssetsList, adminRepairIntegrity } from '../../src/services/promptService';
import * as ImagePicker from 'expo-image-picker';
import { AppModal } from '../../src/components/AppModal';
import { PromptTester } from '../../src/components/admin/PromptTester';
import { PAINTING_STYLES, NMM_MIXED_PROMPT } from '../../src/constants';

// --- Types & Constants ---

type Category = 'Styles' | 'Modes' | 'Effects' | 'Settings' | 'Tools';

const CATEGORY_MAP: Record<string, Category> = {
    'style.': 'Styles',
    'template.': 'Modes',
    'effect.': 'Effects',
    'share.': 'Settings',
    'assets.': 'Settings',
};

const CATEGORY_ORDER: Category[] = ['Styles', 'Modes', 'Effects', 'Settings', 'Tools'];

export default function AdminDashboard() {
    const [prompts, setPrompts] = useState<PromptConfig[]>([]);
    const [loading, setLoading] = useState(true);
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
        setModalConfig({ visible: true, title, message, type, primaryAction, secondaryAction });
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

    useEffect(() => {
        fetchData();
    }, []);

    // Grouping & Categorization
    const { groupedPrompts, categorizedKeys } = useMemo(() => {
        const groups: Record<string, PromptConfig[]> = {};
        const categories: Record<Category, string[]> = {
            Styles: [],
            Modes: [],
            Effects: [],
            Settings: [],
            Tools: [],
        };

        prompts.forEach(p => {
            if (!groups[p.key]) {
                groups[p.key] = [];
                // Categorize
                let foundCat = false;
                for (const [prefix, cat] of Object.entries(CATEGORY_MAP)) {
                    if (p.key.startsWith(prefix)) {
                        categories[cat].push(p.key);
                        foundCat = true;
                        break;
                    }
                }
                if (!foundCat) categories.Settings.push(p.key);
            }
            groups[p.key].push(p);
        });

        // Sort within categories and filter excluded
        Object.keys(categories).forEach((cat) => {
            categories[cat as Category] = categories[cat as Category]
                .filter(key => !['style.oil-painting', 'style.cel-shaded', 'style.blanchitsu'].includes(key))
                .sort();
        });

        return { groupedPrompts: groups, categorizedKeys: categories };
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
        <View style={styles.container}>
            {/* Sidebar */}
            <View style={styles.sidebar}>
                <View style={styles.sidebarHeader}>
                    <Text style={styles.title}>MiniStudio Admin</Text>
                    <View style={styles.headerIcons}>
                        <TouchableOpacity 
                            style={styles.iconBtn} 
                            onPress={handlePickAndUpload}
                            disabled={uploading}
                        >
                            {uploading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.iconText}>📷</Text>}
                        </TouchableOpacity>
                        <TouchableOpacity 
                            style={[styles.iconBtn, { backgroundColor: colors.button.primary }]}
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
                            <Text style={styles.iconText}>+</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                <ScrollView style={styles.navigation} showsVerticalScrollIndicator={false}>
                    {CATEGORY_ORDER.map((category) => {
                        const keysInCat = categorizedKeys[category] || [];
                        if (category === 'Tools') {
                            return (
                                <View key={category} style={styles.navSection}>
                                    <Text style={styles.sectionTitle}>{category.toUpperCase()}</Text>
                                    <TouchableOpacity
                                        onPress={() => { setIsTestingScenarios(true); setSelectedKey(null); setIsEditing(false); }}
                                        style={[styles.navItem, isTestingScenarios && styles.navItemActive]}
                                    >
                                        <Text style={[styles.navItemText, isTestingScenarios && styles.navItemTextActive]}>Prompt Tester</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        onPress={async () => {
                                            const { success, error } = await adminRepairIntegrity();
                                            if (success) {
                                                showModal('Success', 'Data integrity repaired! Only the latest version of each key is now active.', 'default');
                                                await fetchData();
                                            } else {
                                                showModal('Error', error?.message || 'Failed to repair integrity', 'error');
                                            }
                                        }}
                                        style={styles.navItem}
                                    >
                                        <Text style={styles.navItemText}>🛠 Repair Integrity</Text>
                                    </TouchableOpacity>
                                </View>
                            );
                        }
                        
                        if (keysInCat.length === 0) return null;

                        return (
                            <View key={category} style={styles.navSection}>
                                <Text style={styles.sectionTitle}>{category.toUpperCase()}</Text>
                                {keysInCat.map(key => {
                                    const name = groupedPrompts[key][0]?.name || key;
                                    const isActive = selectedKey === key && !isTestingScenarios;
                                    return (
                                        <TouchableOpacity
                                            key={key}
                                            onPress={() => { setSelectedKey(key); setIsEditing(false); setIsTestingScenarios(false); }}
                                            style={[styles.navItem, isActive && styles.navItemActive]}
                                        >
                                            <Text style={[styles.navItemText, isActive && styles.navItemTextActive]} numberOfLines={1}>
                                                {name.replace(' Style', '').replace(' Template', '').replace(' Effect', '')
                                                   .split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                                                {groupedPrompts[key].filter(v => v.is_active).length > 1 && <Text style={{ color: colors.button.danger }}> ⚠️</Text>}
                                            </Text>
                                            <Text style={styles.navItemSubtitle} numberOfLines={1}>{key}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        );
                    })}
                </ScrollView>
            </View>

            {/* Main Content Area */}
            <View style={styles.main}>
                {(selectedKey || isCreatingKey) ? (
                    <View style={styles.contentWrapper}>
                        <View style={styles.contentHeader}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.mainTitle}>{isCreatingKey ? 'New Prompt Key' : (groupedPrompts[selectedKey!]?.[0]?.name || selectedKey)}</Text>
                                <Text style={styles.mainSubtitle}>{selectedKey || 'Creating a new entry in the registry'}</Text>
                            </View>
                            {!isEditing && (
                                <TouchableOpacity style={styles.primaryBtn} onPress={handleCreateNewVersion}>
                                    <Text style={styles.btnText}>New Version</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        {isEditing ? (
                            <ScrollView style={styles.editorScroll} showsVerticalScrollIndicator={true}>
                                <View style={styles.editorCard}>
                                    {isCreatingKey && (
                                        <View style={styles.field}>
                                            <Text style={styles.fieldLabel}>Key Identifier</Text>
                                            <TextInput
                                                style={styles.textInput}
                                                value={newKeyName}
                                                onChangeText={setNewKeyName}
                                                placeholder="e.g. style.grimdark"
                                                placeholderTextColor={colors.text.muted}
                                            />
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
                                        <Text style={styles.fieldLabel}>Prompt Template (Basic)</Text>
                                        <TextInput
                                            style={[styles.textInput, styles.multiLineInput]}
                                            value={editTemplate}
                                            onChangeText={setEditTemplate}
                                            multiline
                                        />
                                    </View>

                                    <View style={styles.field}>
                                        <Text style={[styles.fieldLabel, { color: colors.button.primary }]}>Prompt Template (Pro)</Text>
                                        <TextInput
                                            style={[styles.textInput, styles.multiLineInput]}
                                            value={editTemplatePro}
                                            onChangeText={setEditTemplatePro}
                                            multiline
                                        />
                                    </View>

                                    <View style={styles.field}>
                                        <Text style={styles.fieldLabel}>Negative Prompt (Optional)</Text>
                                        <TextInput
                                            style={[styles.textInput, { height: 100 }]}
                                            value={editNegativeTemplate}
                                            onChangeText={setEditNegativeTemplate}
                                            multiline
                                            placeholder="Instructions for when this effect is OFF"
                                            placeholderTextColor={colors.text.muted}
                                        />
                                    </View>

                                    <View style={styles.editorFooter}>
                                        <TouchableOpacity style={styles.secondaryBtn} onPress={() => setIsEditing(false)}>
                                            <Text style={styles.secondaryBtnText}>Cancel</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={styles.primaryBtn} onPress={handleSaveVersion}>
                                            <Text style={styles.btnText}>{editingId ? 'Update Version' : 'Save Version'}</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </ScrollView>
                        ) : isAssetKey ? (
                            /* Asset Manager */
                            <ScrollView style={styles.scrollContent}>
                                <View style={styles.grid}>
                                    {assetUrls.map((url, index) => (
                                        <View key={url} style={styles.assetCard}>
                                            <Image source={{ uri: url }} style={styles.assetImage} />
                                            <View style={styles.assetInfo}>
                                                <Text style={styles.assetName} numberOfLines={1}>{url.split('/').pop()}</Text>
                                                <View style={styles.assetControls}>
                                                    <TouchableOpacity onPress={() => moveAssetUp(index)} disabled={index === 0} style={[styles.controlBtn, index === 0 && { opacity: 0.3 }]}>
                                                        <Text style={styles.controlText}>↑</Text>
                                                    </TouchableOpacity>
                                                    <TouchableOpacity onPress={() => moveAssetDown(index)} disabled={index === assetUrls.length - 1} style={[styles.controlBtn, index === assetUrls.length - 1 && { opacity: 0.3 }]}>
                                                        <Text style={styles.controlText}>↓</Text>
                                                    </TouchableOpacity>
                                                    <TouchableOpacity onPress={() => deleteAsset(index)} style={[styles.controlBtn, { backgroundColor: colors.button.dangerDark }]}>
                                                        <Text style={styles.controlText}>✕</Text>
                                                    </TouchableOpacity>
                                                </View>
                                            </View>
                                        </View>
                                    ))}
                                    <Pressable style={styles.addAssetCard} onPress={addNewAsset}>
                                        {uploading ? <ActivityIndicator color={colors.text.secondary} /> : <Text style={styles.addAssetText}>+ Add Image</Text>}
                                    </Pressable>
                                </View>
                                {assetsDirty && (
                                    <TouchableOpacity style={[styles.primaryBtn, { alignSelf: 'center', marginTop: 24 }]} onPress={saveAssetOrder}>
                                        <Text style={styles.btnText}>Save Order Changes</Text>
                                    </TouchableOpacity>
                                )}
                            </ScrollView>
                        ) : (
                            /* Version History */
                            <ScrollView style={styles.scrollContent}>
                                {selectedVersions.map((version) => (
                                    <View key={version.id} style={[styles.vCard, version.is_active && styles.vCardActive]}>
                                        <View style={styles.vHeader}>
                                            <View>
                                                <View style={styles.vBadgeRow}>
                                                    <Text style={styles.vLabel}>{version.version_label}</Text>
                                                    {version.is_active && <View style={styles.activePill}><Text style={styles.activePillText}>ACTIVE</Text></View>}
                                                </View>
                                                <Text style={styles.vDate}>{new Date(version.created_at).toLocaleString()}</Text>
                                            </View>
                                            <View style={styles.vActions}>
                                                {!version.is_active && (
                                                    <TouchableOpacity style={styles.activateBtn} onPress={() => handleActivate(version.id, version.key)}>
                                                        <Text style={styles.activateBtnText}>Activate</Text>
                                                    </TouchableOpacity>
                                                )}
                                                <TouchableOpacity style={styles.editBtn} onPress={() => handleEditVersion(version)}>
                                                    <Text style={styles.editBtnText}>Edit</Text>
                                                </TouchableOpacity>
                                            </View>
                                        </View>

                                        <View style={styles.promptPreview}>
                                            <Text style={styles.previewLabel}>PROMPT (BASIC)</Text>
                                            <Text style={styles.previewText} numberOfLines={4}>{version.template || '(No prompt set)'}</Text>
                                        </View>
                                        <View style={[styles.promptPreview, { marginTop: 12, borderLeftColor: colors.button.primary }]}>
                                            <Text style={[styles.previewLabel, { color: colors.button.primary }]}>PROMPT (PRO)</Text>
                                            <Text style={styles.previewText} numberOfLines={4}>{version.template_pro || version.template || '(No prompt set)'}</Text>
                                        </View>
                                    </View>
                                ))}
                            </ScrollView>
                        )}
                    </View>
                ) : isTestingScenarios ? (
                    <PromptTester 
                        stylesList={PAINTING_STYLES.map(s => {
                            const config = groupedPrompts[`style.${s.id}`]?.find(p => p.is_active);
                            return { ...s, prompt: config?.template || s.prompt, promptPro: config?.template_pro || s.prompt };
                        })}
                        effectsList={{
                            'effect.nmm': groupedPrompts['effect.nmm']?.find(p => p.is_active) || { default: '', pro: '' },
                            'effect.osl': groupedPrompts['effect.osl']?.find(p => p.is_active) || { default: '', pro: '' },
                            'effect.photoshoot': groupedPrompts['effect.photoshoot']?.find(p => p.is_active) || { default: '', pro: '' },
                            'effect.nmm.mixed': groupedPrompts['effect.nmm.mixed']?.find(p => p.is_active) || { default: NMM_MIXED_PROMPT, pro: NMM_MIXED_PROMPT }
                        }}
                    />
                ) : (
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyIcon}>⚡</Text>
                        <Text style={styles.emptyTitle}>Command Center</Text>
                        <Text style={styles.emptyText}>Select a prompt category from the sidebar to manage your AI models and aesthetic rules.</Text>
                    </View>
                )}
            </View>

            <AppModal
                visible={modalConfig.visible}
                onClose={hideModal}
                title={modalConfig.title}
                message={modalConfig.message}
                type={modalConfig.type}
                primaryAction={modalConfig.primaryAction ? {
                    ...modalConfig.primaryAction,
                    onPress: () => { modalConfig.primaryAction?.onPress(); hideModal(); }
                } : { label: "Dismiss", onPress: hideModal }}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, flexDirection: 'row', backgroundColor: '#0F0F10' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    
    // Sidebar
    sidebar: { width: 320, backgroundColor: '#141416', borderRightWidth: 1, borderRightColor: '#232326', padding: 24 },
    sidebarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 },
    title: { fontSize: 18, fontFamily: fontFamily.primary, fontWeight: '700', color: '#fff' },
    headerIcons: { flexDirection: 'row', gap: 8 },
    iconBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#232326', justifyContent: 'center', alignItems: 'center' },
    iconText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    navigation: { flex: 1 },
    navSection: { marginBottom: 24 },
    sectionTitle: { fontSize: 11, fontFamily: fontFamily.primary, fontWeight: '700', color: '#6A6A71', letterSpacing: 1.5, marginBottom: 12 },
    navItem: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, marginBottom: 4 },
    navItemActive: { backgroundColor: '#232326' },
    navItemText: { color: '#E0E0E2', fontSize: 13, fontFamily: fontFamily.primary, fontWeight: '600' },
    navItemTextActive: { color: '#fff' },
    navItemSubtitle: { color: '#6A6A71', fontSize: 11, fontFamily: fontFamily.primary, marginTop: 2 },

    // Main Content
    main: { flex: 1, backgroundColor: '#0F0F10' },
    contentWrapper: { flex: 1, padding: 48 },
    contentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 40 },
    mainTitle: { fontSize: 32, fontFamily: fontFamily.primary, fontWeight: '700', color: '#fff' },
    mainSubtitle: { fontSize: 14, fontFamily: fontFamily.primary, color: '#6A6A71', marginTop: 8 },
    primaryBtn: { backgroundColor: '#2C59FF', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
    btnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
    secondaryBtn: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, backgroundColor: '#232326', marginRight: 12 },
    secondaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },

    scrollContent: { flex: 1 },
    emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 64 },
    emptyIcon: { fontSize: 48, marginBottom: 24 },
    emptyTitle: { fontSize: 24, fontWeight: '700', color: '#fff', marginBottom: 12 },
    emptyText: { fontSize: 16, color: '#6A6A71', textAlign: 'center', lineHeight: 24, maxWidth: 400 },

    // Version Cards
    vCard: { backgroundColor: '#141416', borderRadius: 20, padding: 24, marginBottom: 20, borderWidth: 1, borderColor: '#232326' },
    vCardActive: { borderColor: '#34C759', backgroundColor: '#161C18' },
    vHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
    vBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    vLabel: { fontSize: 20, fontWeight: '700', color: '#fff' },
    vDate: { fontSize: 12, color: '#6A6A71', marginTop: 4 },
    activePill: { backgroundColor: 'rgba(52, 199, 89, 0.1)', borderWidth: 1, borderColor: '#34C759', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
    activePillText: { color: '#34C759', fontSize: 10, fontWeight: '800' },
    vActions: { flexDirection: 'row', gap: 8 },
    activateBtn: { backgroundColor: '#34C759', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
    activateBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
    editBtn: { backgroundColor: '#232326', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
    editBtnText: { color: '#E0E0E2', fontSize: 12, fontWeight: '700' },
    promptPreview: { backgroundColor: '#0F0F10', padding: 16, borderRadius: 12, borderLeftWidth: 3, borderLeftColor: '#48484A' },
    previewLabel: { fontSize: 10, fontWeight: '800', color: '#6A6A71', marginBottom: 8, letterSpacing: 0.5 },
    previewText: { color: '#E0E0E2', fontSize: 13, lineHeight: 20, fontFamily: 'monospace' },

    // Editor Area
    editorScroll: { flex: 1 },
    editorCard: { backgroundColor: '#141416', borderRadius: 24, padding: 32, borderWidth: 1, borderColor: '#232326' },
    field: { marginBottom: 24 },
    fieldLabel: { fontSize: 12, fontWeight: '700', color: '#6A6A71', marginBottom: 10, letterSpacing: 0.5 },
    textInput: { backgroundColor: '#0F0F10', borderWidth: 1, borderColor: '#232326', color: '#fff', padding: 16, borderRadius: 12, fontSize: 15 },
    multiLineInput: { height: 260, textAlignVertical: 'top' },
    editorFooter: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 },

    // Grid Assets
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
    assetCard: { width: 180, backgroundColor: '#141416', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#232326' },
    assetImage: { width: '100%', height: 180 },
    assetInfo: { padding: 12 },
    assetName: { color: '#6A6A71', fontSize: 11, marginBottom: 8 },
    assetControls: { flexDirection: 'row', gap: 6 },
    controlBtn: { flex: 1, height: 28, borderRadius: 6, backgroundColor: '#232326', justifyContent: 'center', alignItems: 'center' },
    controlText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
    addAssetCard: { width: 180, height: 250, borderRadius: 16, borderStyle: 'dashed', borderWidth: 2, borderColor: '#232326', justifyContent: 'center', alignItems: 'center' },
    addAssetText: { color: '#6A6A71', fontWeight: 'bold' }
});

