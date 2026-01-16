import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert, StyleSheet, Image } from 'react-native';
import { colors } from '../../src/theme';
import { adminFetchAllPrompts, adminCreatePromptVersion, adminActivatePromptVersion, adminUpdatePrompt, PromptConfig, uploadAsset, adminUpdateAssetsList } from '../../src/services/promptService';
import * as ImagePicker from 'expo-image-picker';

export default function AdminDashboard() {
    const [prompts, setPrompts] = useState<PromptConfig[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedKey, setSelectedKey] = useState<string | null>(null);

    // Editor State
    const [isEditing, setIsEditing] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null); // If null, creating new. If set, updating.
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

    const fetchData = async () => {
        setLoading(true);
        const { data, error } = await adminFetchAllPrompts();
        if (error) {
            Alert.alert('Error', error.message);
        } else {
            setPrompts(data || []);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchData();
    }, []);

    // Group by Key
    const groupedPrompts = useMemo(() => {
        const groups: Record<string, PromptConfig[]> = {};
        prompts.forEach(p => {
            if (!groups[p.key]) groups[p.key] = [];
            groups[p.key].push(p);
        });
        return groups;
    }, [prompts]);

    const keys = Object.keys(groupedPrompts)
        .filter(key => !['style.oil-painting', 'style.cel-shaded', 'style.blanchitsu'].includes(key))
        .sort();

    const handleActivate = async (id: string, key: string) => {
        const { error } = await adminActivatePromptVersion(id, key);
        if (error) {
            Alert.alert('Error', error.message);
        } else {
            await fetchData();
        }
    };

    const handleCreateNewVersion = () => {
        if (!selectedKey) return;
        const versions = groupedPrompts[selectedKey] || [];
        const latest = versions[0]; // Assuming order by created_at desc in service

        setEditingId(null); // Creating new
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
            console.log('handleSaveVersion started');
            const keyToUse = isCreatingKey ? newKeyName : selectedKey;

            if (!keyToUse) {
                Alert.alert('Error', 'No Key selected or created');
                return;
            }

            const versions = groupedPrompts[keyToUse] || [];
            const latest = versions[0];
            const nameToUse = latest?.name || keyToUse;

            let error;
            if (editingId) {
                // Update existing
                console.log('[Admin] Updating', editingId, {
                    version_label: editVersionLabel,
                    template: editTemplate,
                    template_pro: editTemplatePro,
                    neg: editNegativeTemplate,
                    negPro: editNegativeTemplatePro
                });
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
                // Create new
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
                console.error('Operation Error', error);
                Alert.alert('Error', error.message);
            } else {
                setIsEditing(false);
                setIsCreatingKey(false); // Reset
                setEditingId(null);
                if (isCreatingKey) setSelectedKey(keyToUse); // Select the new key
                Alert.alert('Success', 'Version saved successfully');
                await fetchData();
            }
        } catch (e: any) {
            console.error('handleSaveVersion Exception', e);
            Alert.alert('Exception', e.message || 'Unknown error occurred');
        }
    };

    const handlePickAndUpload = async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true, // Allow cropping if needed, but maybe not for full assets
                quality: 0.8,
            });

            if (!result.canceled) {
                setUploading(true);
                const asset = result.assets[0];
                const fileName = `asset_${Date.now()}.png`;

                // 1. Upload
                const { publicUrl, error: uploadError } = await uploadAsset(asset.uri, fileName);
                if (uploadError || !publicUrl) {
                    Alert.alert('Upload Failed', uploadError?.message || 'Unknown error');
                    setUploading(false);
                    return;
                }

                // 2. Add to list
                // Get current list from current active config if exists
                const assetKey = 'assets.examples';
                const currentConfig = groupedPrompts[assetKey]?.find(p => p.is_active);
                let currentList: string[] = [];
                if (currentConfig) {
                    try {
                        const parsed = JSON.parse(currentConfig.template);
                        if (parsed.urls && Array.isArray(parsed.urls)) {
                            currentList = parsed.urls;
                        }
                    } catch (e) {
                        // ignore parse error
                    }
                }

                const newList = [...currentList, publicUrl];
                const { error: dbError } = await adminUpdateAssetsList(newList);

                if (dbError) {
                    Alert.alert('Database Update Failed', dbError.message);
                } else {
                    Alert.alert('Success', 'Asset uploaded and list updated!');
                    await fetchData();
                }
                setUploading(false);
            }
        } catch (e: any) {
            Alert.alert('Error', e.message);
            setUploading(false);
        }
    };

    // Asset Manager Functions
    const isAssetKey = selectedKey === 'assets.examples';

    // Load asset URLs when assets.examples is selected
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
            Alert.alert('Error', error.message);
        } else {
            Alert.alert('Success', 'Asset order saved!');
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
                    Alert.alert('Upload Failed', uploadError?.message || 'Unknown error');
                    setUploading(false);
                    return;
                }

                const newUrls = [...assetUrls, publicUrl];
                const { error: dbError } = await adminUpdateAssetsList(newUrls);
                if (dbError) {
                    Alert.alert('Database Update Failed', dbError.message);
                } else {
                    setAssetUrls(newUrls);
                    Alert.alert('Success', 'Asset uploaded!');
                    await fetchData();
                }
                setUploading(false);
            }
        } catch (e: any) {
            Alert.alert('Error', e.message);
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
                <View style={styles.sidebarHeaderContainer}>
                    <Text style={styles.headerTitle}>Prompts</Text>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                        <TouchableOpacity
                            style={styles.addKeyButton}
                            onPress={handlePickAndUpload}
                            disabled={uploading}
                        >
                            {uploading ? (
                                <ActivityIndicator size="small" color={colors.admin.textCode} />
                            ) : (
                                <Text style={styles.addKeyButtonText}>📷</Text>
                            )}
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.addKeyButton}
                            onPress={() => {
                                setIsCreatingKey(true);
                                setIsEditing(true);
                                setSelectedKey(null);
                                setEditingId(null);
                                setNewKeyName(''); // Reset
                                setEditVersionLabel('v1.0');
                                setEditTemplate('');
                                setEditTemplatePro('');
                            }}
                        >
                            <Text style={styles.addKeyButtonText}>+</Text>
                        </TouchableOpacity>
                    </View>
                </View>
                <ScrollView style={styles.sidebarList}>
                    {keys.map(key => {
                        const name = groupedPrompts[key][0]?.name || key;
                        return (
                            <TouchableOpacity
                                key={key}
                                onPress={() => { setSelectedKey(key); setIsEditing(false); }}
                                style={[
                                    styles.sidebarItem,
                                    selectedKey === key && styles.sidebarItemActive
                                ]}
                            >
                                <Text style={[
                                    styles.sidebarItemText,
                                    selectedKey === key && styles.sidebarItemTextActive
                                ]}>{name}</Text>
                                <Text style={[
                                    styles.sidebarItemSubText,
                                    selectedKey === key && styles.sidebarItemTextActive
                                ]}>{key}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </View>

            {/* Main Content */}
            <View style={styles.main}>
                {(selectedKey || isCreatingKey) ? (
                    <>
                        {!isCreatingKey && (
                            <View style={styles.mainHeader}>
                                <View>
                                    <Text style={styles.keyTitle}>{groupedPrompts[selectedKey!]?.[0]?.name || selectedKey}</Text>
                                    <Text style={styles.keySubtitle}>{selectedKey}</Text>
                                </View>
                                <TouchableOpacity style={styles.createButton} onPress={handleCreateNewVersion}>
                                    <Text style={styles.createButtonText}>+ New Version</Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        {isEditing ? (
                            <ScrollView style={styles.editorContainer} showsVerticalScrollIndicator={true}>
                                {isCreatingKey && (
                                    <>
                                        <Text style={styles.label}>New Key (e.g. share.message)</Text>
                                        <TextInput
                                            style={styles.input}
                                            value={newKeyName}
                                            onChangeText={setNewKeyName}
                                            placeholder="share.message"
                                            placeholderTextColor={colors.border.strong}
                                        />
                                    </>
                                )}

                                <Text style={styles.label}>Version Label</Text>
                                <TextInput
                                    style={styles.input}
                                    value={editVersionLabel}
                                    onChangeText={setEditVersionLabel}
                                />

                                <Text style={styles.label}>Template (Default)</Text>
                                <TextInput
                                    style={[styles.input, styles.textArea]}
                                    value={editTemplate}
                                    onChangeText={setEditTemplate}
                                    multiline
                                />

                                <Text style={styles.label}>Template (Pro)</Text>
                                <TextInput
                                    style={[styles.input, styles.textArea]}
                                    value={editTemplatePro}
                                    onChangeText={setEditTemplatePro}
                                    multiline
                                />

                                <Text style={styles.label}>Negative (Default) - optional</Text>
                                <TextInput
                                    style={[styles.input, styles.textArea]}
                                    value={editNegativeTemplate}
                                    onChangeText={setEditNegativeTemplate}
                                    multiline
                                    placeholder="Text to append when effect is OFF"
                                    placeholderTextColor={colors.border.strong}
                                />

                                <Text style={styles.label}>Negative (Pro) - optional</Text>
                                <TextInput
                                    style={[styles.input, styles.textArea]}
                                    value={editNegativeTemplatePro}
                                    onChangeText={setEditNegativeTemplatePro}
                                    multiline
                                    placeholder="Text to append when effect is OFF"
                                    placeholderTextColor={colors.border.strong}
                                />

                                <View style={styles.editorActions}>
                                    <TouchableOpacity style={styles.cancelButton} onPress={() => setIsEditing(false)}>
                                        <Text style={styles.actionButtonText}>Cancel</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.saveButton} onPress={handleSaveVersion}>
                                        <Text style={styles.actionButtonText}>{editingId ? 'Update Version' : 'Save New Version'}</Text>
                                    </TouchableOpacity>
                                </View>
                            </ScrollView>

                        ) : isAssetKey ? (
                            /* Asset Manager UI */
                            <ScrollView style={styles.versionsList}>
                                <Text style={styles.keyTitle}>Demo Assets</Text>
                                <Text style={[styles.keySubtitle, { marginBottom: 20 }]}>Manage images shown in Gallery</Text>

                                {assetUrls.map((url, index) => (
                                    <View key={url} style={styles.assetRow}>
                                        <Image source={{ uri: url }} style={styles.assetThumb} />
                                        <Text style={styles.assetUrl} numberOfLines={1}>{url.split('/').pop()}</Text>
                                        <View style={styles.assetActions}>
                                            <TouchableOpacity
                                                style={[styles.assetBtn, index === 0 && styles.assetBtnDisabled]}
                                                onPress={() => moveAssetUp(index)}
                                                disabled={index === 0}
                                            >
                                                <Text style={styles.assetBtnText}>↑</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={[styles.assetBtn, index === assetUrls.length - 1 && styles.assetBtnDisabled]}
                                                onPress={() => moveAssetDown(index)}
                                                disabled={index === assetUrls.length - 1}
                                            >
                                                <Text style={styles.assetBtnText}>↓</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={[styles.assetBtn, styles.assetBtnDelete]}
                                                onPress={() => deleteAsset(index)}
                                            >
                                                <Text style={styles.assetBtnText}>✕</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                ))}

                                <View style={styles.assetFooter}>
                                    <TouchableOpacity style={styles.addAssetButton} onPress={addNewAsset} disabled={uploading}>
                                        {uploading ? (
                                            <ActivityIndicator size="small" color={colors.palette.white} />
                                        ) : (
                                            <Text style={styles.addAssetButtonText}>+ Add Image</Text>
                                        )}
                                    </TouchableOpacity>
                                    {assetsDirty && (
                                        <TouchableOpacity style={styles.saveOrderButton} onPress={saveAssetOrder}>
                                            <Text style={styles.saveOrderButtonText}>Save Order</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            </ScrollView>
                        ) : (
                            <ScrollView style={styles.versionsList}>
                                {selectedVersions.map(version => (
                                    <View key={version.id} style={[styles.versionCard, version.is_active && styles.activeCard]}>
                                        <View style={styles.versionHeader}>
                                            <View style={styles.versionInfo}>
                                                <Text style={[styles.versionLabel, version.is_active && styles.activeText]}>
                                                    {version.version_label}
                                                </Text>
                                                <Text style={styles.dateLabel}>
                                                    {new Date(version.created_at).toLocaleString()}
                                                </Text>
                                            </View>

                                            {version.is_active ? (
                                                <View style={styles.activeBadge}>
                                                    <Text style={styles.activeBadgeText}>ACTIVE</Text>
                                                </View>
                                            ) : (
                                                <TouchableOpacity
                                                    style={styles.activateButton}
                                                    onPress={() => handleActivate(version.id, version.key)}
                                                >
                                                    <Text style={styles.activateButtonText}>Make Active</Text>
                                                </TouchableOpacity>
                                            )}
                                            <TouchableOpacity
                                                style={styles.editButton}
                                                onPress={() => handleEditVersion(version)}
                                            >
                                                <Text style={styles.editButtonText}>Edit</Text>
                                            </TouchableOpacity>
                                        </View>
                                        <View style={styles.templateSection}>
                                            <Text style={styles.sectionLabel}>Default:</Text>
                                            <Text style={styles.templateText}>{version.template}</Text>
                                        </View>
                                        <View style={[styles.templateSection, { marginTop: 12 }]}>
                                            <Text style={[styles.sectionLabel, { color: colors.button.primary }]}>Pro:</Text>
                                            <Text style={styles.templateText}>{version.template_pro}</Text>
                                        </View>

                                        {(version.negative_template || version.negative_template_pro) && (
                                            <View style={[styles.templateSection, { marginTop: 12, borderColor: colors.admin.danger }]}>
                                                <Text style={[styles.sectionLabel, { color: colors.admin.danger }]}>Negative:</Text>
                                                {version.negative_template ? <Text style={styles.templateText}>[Def] {version.negative_template}</Text> : null}
                                                {version.negative_template_pro ? <Text style={styles.templateText}>[Pro] {version.negative_template_pro}</Text> : null}
                                            </View>
                                        )}
                                    </View>
                                ))}
                            </ScrollView>
                        )}
                    </>
                ) : (
                    <View style={styles.center}>
                        <Text style={styles.placeholderText}>Select a prompt key to edit or create a new one</Text>
                    </View>
                )}
            </View>
        </View >
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, flexDirection: 'row', backgroundColor: colors.admin.background },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    sidebar: { width: 300, borderRightWidth: 1, borderRightColor: colors.admin.border, padding: 20 },
    headerTitle: { fontSize: 24, fontWeight: 'bold', color: colors.admin.text, marginBottom: 20 },
    sidebarList: { flex: 1 },
    sidebarItem: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 6, marginBottom: 4 },
    sidebarItemActive: { backgroundColor: colors.admin.active },
    sidebarItemText: { color: colors.admin.text, fontSize: 14, fontWeight: 'bold' },
    sidebarItemSubText: { color: colors.admin.textSecondary, fontSize: 12, marginTop: 2 },
    sidebarItemTextActive: { color: colors.admin.text },

    main: { flex: 1, padding: 40 },
    mainHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 },
    keyTitle: { fontSize: 32, fontWeight: 'bold', color: colors.admin.text },
    keySubtitle: { fontSize: 14, color: colors.admin.textSecondary, marginTop: 4 },
    createButton: { backgroundColor: colors.admin.success, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 6 },
    createButtonText: { color: colors.palette.white, fontWeight: 'bold' },

    versionsList: { flex: 1 },
    versionCard: { backgroundColor: colors.admin.card, borderRadius: 8, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: colors.admin.border },
    activeCard: { borderColor: colors.admin.success, backgroundColor: colors.admin.card },
    versionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
    versionInfo: {},
    versionLabel: { fontSize: 18, fontWeight: 'bold', color: colors.admin.text },
    activeText: { color: colors.admin.success },
    dateLabel: { fontSize: 12, color: colors.admin.textSecondary, marginTop: 4 },

    activeBadge: { backgroundColor: colors.admin.badgeBg, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 12, borderWidth: 1, borderColor: colors.admin.success },
    activeBadgeText: { color: colors.admin.successText, fontSize: 12, fontWeight: 'bold' },

    activateButton: { backgroundColor: colors.admin.active, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6 },
    activateButtonText: { color: colors.palette.white, fontSize: 12, fontWeight: 'bold' },

    editButton: { marginLeft: 8, backgroundColor: colors.admin.border, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6 },
    editButtonText: { color: colors.admin.textCode, fontSize: 12, fontWeight: 'bold' },

    templateSection: { backgroundColor: colors.admin.background, padding: 12, borderRadius: 6, borderWidth: 1, borderColor: colors.admin.border },
    sectionLabel: { color: colors.admin.textSecondary, fontSize: 11, fontWeight: 'bold', marginBottom: 4, textTransform: 'uppercase' },
    templateText: { color: colors.admin.textCode, fontFamily: 'monospace', lineHeight: 22, fontSize: 14 },
    placeholderText: { color: colors.admin.textSecondary, fontSize: 18 },

    // Editor
    editorContainer: { flex: 1, maxWidth: 800 },
    label: { color: colors.admin.textSecondary, marginBottom: 8, marginTop: 20, fontWeight: 'bold' },
    input: { backgroundColor: colors.admin.background, borderWidth: 1, borderColor: colors.admin.border, color: colors.admin.text, padding: 12, borderRadius: 6, fontSize: 16 },
    textArea: { height: 400, minHeight: 400, textAlignVertical: 'top' },
    editorActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 30, gap: 12 },
    cancelButton: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 6, backgroundColor: colors.admin.border },
    saveButton: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 6, backgroundColor: colors.admin.success },
    actionButtonText: { color: colors.palette.white, fontWeight: 'bold' },



    sidebarHeaderContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    addKeyButton: { backgroundColor: colors.admin.border, width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
    addKeyButtonText: { color: colors.admin.textCode, fontSize: 20, lineHeight: 22, fontWeight: 'bold' },

    // Asset Manager Styles
    assetRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.admin.card, borderRadius: 8, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.admin.border },
    assetThumb: { width: 60, height: 60, borderRadius: 6, marginRight: 12 },
    assetUrl: { flex: 1, color: colors.admin.textCode, fontSize: 13 },
    assetActions: { flexDirection: 'row', gap: 6 },
    assetBtn: { width: 32, height: 32, borderRadius: 6, backgroundColor: colors.admin.border, justifyContent: 'center', alignItems: 'center' },
    assetBtnDisabled: { opacity: 0.3 },
    assetBtnDelete: { backgroundColor: colors.button.dangerDark },
    assetBtnText: { color: colors.admin.text, fontSize: 16, fontWeight: 'bold' },
    assetFooter: { flexDirection: 'row', gap: 12, marginTop: 16 },
    addAssetButton: { flex: 1, backgroundColor: colors.admin.success, paddingVertical: 12, borderRadius: 6, alignItems: 'center' },
    addAssetButtonText: { color: colors.palette.white, fontWeight: 'bold', fontSize: 14 },
    saveOrderButton: { flex: 1, backgroundColor: colors.admin.active, paddingVertical: 12, borderRadius: 6, alignItems: 'center' },
    saveOrderButtonText: { color: colors.palette.white, fontWeight: 'bold', fontSize: 14 },
});
