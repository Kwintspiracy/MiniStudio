import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert, StyleSheet } from 'react-native';
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

    // New Key State
    const [isCreatingKey, setIsCreatingKey] = useState(false);
    const [newKeyName, setNewKeyName] = useState('');

    // Asset Manager State
    const [uploading, setUploading] = useState(false);

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

    const keys = Object.keys(groupedPrompts).sort();

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
        setIsEditing(true);
    };

    const handleEditVersion = (version: PromptConfig) => {
        setEditingId(version.id);
        setEditVersionLabel(version.version_label);
        setEditTemplate(version.template);
        setEditTemplatePro(version.template_pro || version.template);
        setIsEditing(true);
    };

    const handleSaveVersion = async () => {
        const keyToUse = isCreatingKey ? newKeyName : selectedKey;
        if (!keyToUse) return;

        const versions = groupedPrompts[keyToUse] || [];
        const latest = versions[0];
        const nameToUse = latest?.name || keyToUse;

        let error;
        if (editingId) {
            // Update existing
            const result = await adminUpdatePrompt(editingId, {
                version_label: editVersionLabel,
                template: editTemplate,
                template_pro: editTemplatePro,
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
                editTemplatePro
            );
            error = result.error;
        }

        if (error) {
            Alert.alert('Error', error.message);
        } else {
            setIsEditing(false);
            setIsCreatingKey(false); // Reset
            setEditingId(null);
            if (isCreatingKey) setSelectedKey(keyToUse); // Select the new key
            await fetchData();
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

    if (loading && prompts.length === 0) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color="#0058DB" />
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
                                <ActivityIndicator size="small" color="#C9D1D9" />
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
                            <View style={styles.editorContainer}>
                                {isCreatingKey && (
                                    <>
                                        <Text style={styles.label}>New Key (e.g. share.message)</Text>
                                        <TextInput
                                            style={styles.input}
                                            value={newKeyName}
                                            onChangeText={setNewKeyName}
                                            placeholder="share.message"
                                            placeholderTextColor="#666"
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

                                <View style={styles.editorActions}>
                                    <TouchableOpacity style={styles.cancelButton} onPress={() => setIsEditing(false)}>
                                        <Text style={styles.actionButtonText}>Cancel</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.saveButton} onPress={handleSaveVersion}>
                                        <Text style={styles.actionButtonText}>{editingId ? 'Update Version' : 'Save New Version'}</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>

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
                                            <Text style={[styles.sectionLabel, { color: '#0058DB' }]}>Pro:</Text>
                                            <Text style={styles.templateText}>{version.template_pro}</Text>
                                        </View>
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
    container: { flex: 1, flexDirection: 'row', backgroundColor: '#0D1117' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    sidebar: { width: 300, borderRightWidth: 1, borderRightColor: '#30363D', padding: 20 },
    headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#F0F6FC', marginBottom: 20 },
    sidebarList: { flex: 1 },
    sidebarItem: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 6, marginBottom: 4 },
    sidebarItemActive: { backgroundColor: '#1F6FEB' },
    sidebarItemText: { color: '#F0F6FC', fontSize: 14, fontWeight: 'bold' },
    sidebarItemSubText: { color: '#8B949E', fontSize: 12, marginTop: 2 },
    sidebarItemTextActive: { color: '#F0F6FC' },

    main: { flex: 1, padding: 40 },
    mainHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 },
    keyTitle: { fontSize: 32, fontWeight: 'bold', color: '#F0F6FC' },
    keySubtitle: { fontSize: 14, color: '#8B949E', marginTop: 4 },
    createButton: { backgroundColor: '#238636', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 6 },
    createButtonText: { color: '#FFFFFF', fontWeight: 'bold' },

    versionsList: { flex: 1 },
    versionCard: { backgroundColor: '#161B22', borderRadius: 8, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: '#30363D' },
    activeCard: { borderColor: '#238636', backgroundColor: '#161B22' },
    versionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
    versionInfo: {},
    versionLabel: { fontSize: 18, fontWeight: 'bold', color: '#F0F6FC' },
    activeText: { color: '#238636' },
    dateLabel: { fontSize: 12, color: '#8B949E', marginTop: 4 },

    activeBadge: { backgroundColor: 'rgba(35, 134, 54, 0.2)', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 12, borderWidth: 1, borderColor: '#238636' },
    activeBadgeText: { color: '#3FB950', fontSize: 12, fontWeight: 'bold' },

    activateButton: { backgroundColor: '#1F6FEB', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6 },
    activateButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: 'bold' },

    editButton: { marginLeft: 8, backgroundColor: '#30363D', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6 },
    editButtonText: { color: '#C9D1D9', fontSize: 12, fontWeight: 'bold' },

    templateSection: { backgroundColor: '#0D1117', padding: 12, borderRadius: 6, borderWidth: 1, borderColor: '#30363D' },
    sectionLabel: { color: '#8B949E', fontSize: 11, fontWeight: 'bold', marginBottom: 4, textTransform: 'uppercase' },
    templateText: { color: '#C9D1D9', fontFamily: 'monospace', lineHeight: 22, fontSize: 14 },
    placeholderText: { color: '#8B949E', fontSize: 18 },

    // Editor
    editorContainer: { flex: 1, maxWidth: 800 },
    label: { color: '#8B949E', marginBottom: 8, marginTop: 20, fontWeight: 'bold' },
    input: { backgroundColor: '#0D1117', borderWidth: 1, borderColor: '#30363D', color: '#F0F6FC', padding: 12, borderRadius: 6, fontSize: 16 },
    textArea: { height: 300, textAlignVertical: 'top' },
    editorActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 30, gap: 12 },
    cancelButton: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 6, backgroundColor: '#30363D' },
    saveButton: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 6, backgroundColor: '#238636' },
    actionButtonText: { color: '#FFFFFF', fontWeight: 'bold' },

    sidebarHeaderContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    addKeyButton: { backgroundColor: '#30363D', width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
    addKeyButtonText: { color: '#C9D1D9', fontSize: 20, lineHeight: 22, fontWeight: 'bold' },
});
