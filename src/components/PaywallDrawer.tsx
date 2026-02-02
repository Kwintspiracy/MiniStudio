import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
    Pressable,
    ActivityIndicator,
    Dimensions,
} from 'react-native';
import { colors, fontFamily } from '../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Purchases, { PurchasesPackage } from 'react-native-purchases';
import Constants from 'expo-constants';
import { AppModal } from './AppModal';
import { useEntitlements } from '../hooks/useEntitlements';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface PaywallDrawerProps {
    visible: boolean;
    onClose: () => void;
}

type PlanType = 'monthly' | 'annual' | 'tokens';

interface PlanOption {
    id: PlanType;
    title: string;
    subtitle: string;
    price: string;
    originalPrice?: string;
    badge?: string;
    packageIdentifier?: string;
}

export function PaywallDrawer({ visible, onClose }: PaywallDrawerProps) {
    const insets = useSafeAreaInsets();
    const { refetch } = useEntitlements();
    const [selectedPlan, setSelectedPlan] = useState<PlanType>('annual');
    const [packages, setPackages] = useState<PurchasesPackage[]>([]);
    const [loading, setLoading] = useState(true);
    const [purchasing, setPurchasing] = useState(false);
    
    const [modalConfig, setModalConfig] = useState<{
        visible: boolean;
        title: string;
        message: string;
        type?: 'default' | 'error' | 'critical';
        primaryAction?: { label: string; onPress: () => void };
    }>({ visible: false, title: '', message: '' });

    const showModal = (
        title: string, 
        message: string, 
        type: 'default' | 'error' | 'critical' = 'default',
        primaryAction?: { label: string; onPress: () => void }
    ) => {
        setModalConfig({ visible: true, title, message, type, primaryAction });
    };
    
    const hideModal = () => {
        setModalConfig(prev => ({ ...prev, visible: false }));
    };

    // Plan options based on Figma design
    const plans: PlanOption[] = [
        {
            id: 'annual',
            title: '12 Months',
            subtitle: '60 Monthly Tokens',
            price: '$4.49 / Month',
            originalPrice: '$5.99',
            badge: 'Best Value!',
            packageIdentifier: '$rc_annual',
        },
        {
            id: 'monthly',
            title: 'Monthly',
            subtitle: '60 Monthly Tokens',
            price: '$5.99 / Month',
            packageIdentifier: '$rc_monthly',
        },
        {
            id: 'tokens',
            title: '200 Tokens Pack',
            subtitle: 'Cumulative tokens packs',
            price: '$17.99',
            packageIdentifier: 'Tokens_200',
        },
    ];

    useEffect(() => {
        if (visible) {
            loadOfferings();
        }
    }, [visible]);

    const loadOfferings = async () => {
        setLoading(true);
        try {
            const offerings = await Purchases.getOfferings();
            if (offerings.current && offerings.current.availablePackages.length !== 0) {
                console.log('[PaywallDrawer] Loaded packages from RevenueCat:', offerings.current.availablePackages.map(p => ({ id: p.identifier, type: p.packageType })));
                setPackages(offerings.current.availablePackages);
            } else {
                // Mock data fallback
                console.log("Using Mock Offerings for UI Dev");
                setPackages([
                    {
                        identifier: 'Monthly',
                        packageType: 'MONTHLY',
                        product: {
                            identifier: 'pro_monthly',
                            description: '60 Monthly Tokens',
                            title: 'Monthly',
                            price: 5.99,
                            priceString: '$5.99',
                            currencyCode: 'USD',
                            productType: 'AUTO_RENEWABLE_SUBSCRIPTION',
                        }
                    },
                    {
                        identifier: 'Annual',
                        packageType: 'ANNUAL',
                        product: {
                            identifier: 'pro_annual',
                            description: '60 Monthly Tokens',
                            title: 'Annual',
                            price: 53.88,
                            priceString: '$53.88',
                            currencyCode: 'USD',
                            productType: 'AUTO_RENEWABLE_SUBSCRIPTION',
                        }
                    },
                    {
                        identifier: 'Tokens_200',
                        packageType: 'CUSTOM',
                        product: {
                            identifier: 'tokens_200',
                            description: '200 Tokens',
                            title: 'Pack of Tokens',
                            price: 17.99,
                            priceString: '$17.99',
                            currencyCode: 'USD',
                            productType: 'CONSUMABLE',
                        }
                    }
                ] as any);
            }
        } catch (e) {
            console.warn("Error fetching offerings:", e);
            // Fallback mock data
            setPackages([
                {
                    identifier: 'Monthly',
                    packageType: 'MONTHLY',
                    product: { identifier: 'pro_monthly', description: '60 Monthly Tokens', title: 'Monthly', priceString: '$5.99', productType: 'AUTO_RENEWABLE_SUBSCRIPTION' }
                },
                {
                    identifier: 'Annual',
                    packageType: 'ANNUAL',
                    product: { identifier: 'pro_annual', description: '60 Monthly Tokens', title: 'Annual', priceString: '$53.88', productType: 'AUTO_RENEWABLE_SUBSCRIPTION' }
                },
                {
                    identifier: 'Tokens_200',
                    packageType: 'CUSTOM',
                    product: { identifier: 'tokens_200', description: '200 Tokens', title: 'Pack of Tokens', priceString: '$17.99', productType: 'CONSUMABLE' }
                }
            ] as any);
        } finally {
            setLoading(false);
        }
    };

    const getPackageForPlan = (planId: PlanType): PurchasesPackage | undefined => {
        const plan = plans.find(p => p.id === planId);
        console.log(`[PaywallDrawer] Looking for package - planId: ${planId}, plan:`, plan);
        if (!plan?.packageIdentifier) {
            console.log('[PaywallDrawer] No packageIdentifier found for plan');
            return undefined;
        }
        console.log(`[PaywallDrawer] Searching for package with identifier: ${plan.packageIdentifier}`);
        console.log('[PaywallDrawer] Available packages:', packages.map(p => ({ id: p.identifier, type: p.packageType })));
        const foundPackage = packages.find(p => p.identifier === plan.packageIdentifier);
        console.log('[PaywallDrawer] Found package:', foundPackage ? foundPackage.identifier : 'NOT FOUND');
        return foundPackage;
    };

    const handlePurchase = async () => {
        console.log('[PaywallDrawer] 1. handlePurchase started');
        const pack = getPackageForPlan(selectedPlan);
        
        if (!pack) {
            // Annual plan not yet available
            if (selectedPlan === 'annual') {
                showModal("Coming Soon", "The 12-month plan will be available soon!", 'default', {
                    label: "OK",
                    onPress: hideModal
                });
                return;
            }
            showModal("Error", "Package not available", 'error');
            return;
        }

        if (purchasing) return;
        console.log('[PaywallDrawer] 2. Setting purchasing=true');
        setPurchasing(true);

        // Mock package handling
        if (pack.product.title.includes("(Mock)") || Constants.appOwnership === 'expo') {
            console.log('[PaywallDrawer] 3. Mock purchase detected');
            setTimeout(() => {
                console.log('[PaywallDrawer] 4. Mock purchase completed');
                setPurchasing(false);
                showModal(
                    "Simulated Purchase Successful",
                    "You successfully simulated a purchase. (No real money was charged).",
                    'default',
                    {
                        label: "Continue",
                        onPress: () => {
                            console.log('[PaywallDrawer] 5. Mock modal OK pressed');
                            hideModal();
                            console.log('[PaywallDrawer] 6. Modal hidden, waiting before closing drawer');
                            // Wait for AppModal to animate out before closing PaywallDrawer
                            setTimeout(() => {
                                console.log('[PaywallDrawer] 7. Closing drawer');
                                onClose();
                                console.log('[PaywallDrawer] 8. Mock drawer closed');
                            }, 350);
                        }
                    }
                );
            }, 1000);
            return;
        }

        try {
            console.log('[PaywallDrawer] 3. Calling Purchases.purchasePackage');
            await Purchases.purchasePackage(pack);
            console.log('[PaywallDrawer] 4. Purchase successful');
            
            // Trigger background refresh (non-blocking)
            console.log('[PaywallDrawer] 5. Calling refetch (non-blocking)');
            refetch();
            console.log('[PaywallDrawer] 6. Refetch called, showing modal');

            showModal("Tokens added!", selectedPlan === 'tokens' ? "You’re ready to generate." : "Welcome to Pro!", 'default', {
                label: "OK",
                onPress: () => {
                    console.log('[PaywallDrawer] 7. Success modal OK pressed');
                    hideModal();
                    console.log('[PaywallDrawer] 8. Modal hidden, waiting before closing drawer');
                    // Wait for AppModal to animate out before closing PaywallDrawer
                    // This prevents simultaneous modal close animations that cause freeze
                    setTimeout(() => {
                        console.log('[PaywallDrawer] 9. Closing drawer');
                        onClose();
                        console.log('[PaywallDrawer] 10. Drawer closed, scheduling delayed refetch');
                        // Give drawer time to close before refetching
                        setTimeout(() => {
                            console.log('[PaywallDrawer] 11. Executing delayed refetch');
                            refetch();
                            console.log('[PaywallDrawer] 12. Delayed refetch completed');
                        }, 300);
                    }, 350);
                }
            });
            console.log('[PaywallDrawer] Modal shown');
        } catch (e: any) {
            console.log('[PaywallDrawer] Purchase error:', e);
            if (!e.userCancelled) {
                if (e.message?.includes("cancelled") || e.code === 1) {
                    return;
                }
                console.error(e);
                showModal("Error", e.message, 'error');
            }
        } finally {
            console.log('[PaywallDrawer] Setting purchasing=false');
            setPurchasing(false);
        }
    };

    const getPurchaseButtonText = () => {
        const plan = plans.find(p => p.id === selectedPlan);
        if (!plan) return 'Purchase';
        if (selectedPlan === 'tokens') return `Purchase ${plan.price}`;
        if (selectedPlan === 'annual') return `Purchase Yearly ($53.88)`;
        return `Purchase ${plan.price.replace(' / Month', '')} Monthly`;
    };

    const renderPlanCard = (plan: PlanOption) => {
        const isSelected = selectedPlan === plan.id;
        
        return (
            <TouchableOpacity
                key={plan.id}
                style={[
                    styles.planCard,
                    isSelected && styles.planCardSelected,
                ]}
                onPress={() => setSelectedPlan(plan.id)}
                activeOpacity={0.8}
            >
                {plan.badge && (
                    <View style={styles.badge}>
                        <Text style={styles.badgeText}>{plan.badge}</Text>
                    </View>
                )}
                <View style={styles.planInfo}>
                    <Text style={styles.planTitle}>{plan.title}</Text>
                    <Text style={styles.planSubtitle}>{plan.subtitle}</Text>
                </View>
                <View style={styles.planPriceContainer}>
                    {plan.originalPrice && (
                        <Text style={styles.originalPrice}>{plan.originalPrice}</Text>
                    )}
                    <Text style={styles.planPrice}>{plan.price}</Text>
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="slide"
            onRequestClose={onClose}
        >
            <Pressable style={styles.overlay} onPress={onClose}>
                <Pressable 
                    style={[styles.drawer, { paddingBottom: insets.bottom + 16 }]}
                    onPress={(e) => e.stopPropagation()}
                >
                    {/* Handle bar */}
                    <View style={styles.handleBar} />
                    
                    {/* Title */}
                    <Text style={styles.title}>
                        Keep building your perfect paint plan.
                    </Text>

                    {/* Plan Cards */}
                    {loading ? (
                        <ActivityIndicator size="large" color={colors.button.primary} style={{ marginVertical: 40 }} />
                    ) : (
                        <View style={styles.plansContainer}>
                            {plans.map(renderPlanCard)}
                        </View>
                    )}

                    {/* Footer - Standardized to match mainView */}
                    <View style={styles.footerContainer}>
                        <TouchableOpacity
                            style={styles.purchaseButton}
                            onPress={handlePurchase}
                            disabled={purchasing || loading}
                            activeOpacity={0.8}
                        >
                            {purchasing ? (
                                <ActivityIndicator size="small" color={colors.palette.white} />
                            ) : (
                                <Text style={styles.purchaseButtonText}>{getPurchaseButtonText()}</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </Pressable>
            </Pressable>

            <AppModal
                visible={modalConfig.visible}
                onClose={hideModal}
                title={modalConfig.title}
                message={modalConfig.message}
                type={modalConfig.type}
                primaryAction={modalConfig.primaryAction || { label: "OK", onPress: hideModal }}
            />
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
    },
    drawer: {
        backgroundColor: colors.background.secondary,
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        paddingTop: 12,
        maxHeight: SCREEN_HEIGHT * 0.85,
    },
    handleBar: {
        width: 36,
        height: 5,
        backgroundColor: colors.overlay.medium,
        borderRadius: 3,
        alignSelf: 'center',
        marginBottom: 20,
    },
    title: {
        fontSize: 24,
        fontWeight: '700',
        color: colors.text.primary,
        fontFamily: fontFamily.primary,
        textAlign: 'center',
        marginBottom: 32,
        lineHeight: 32,
        paddingHorizontal: 32,
    },
    plansContainer: {
        gap: 24,
        marginBottom: 24,
        paddingHorizontal: 24,
    },
    planCard: {
        backgroundColor: colors.background.tertiary,
        borderRadius: 21,
        borderWidth: 2,
        borderColor: colors.background.tertiary,
        paddingHorizontal: 16,
        paddingVertical: 24,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    planCardSelected: {
        borderColor: colors.button.primary,
    },
    badge: {
        position: 'absolute',
        top: -12,
        left: 16,
        backgroundColor: '#4ADE80',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
    },
    badgeText: {
        color: colors.text.dark,
        fontSize: 13,
        fontWeight: '700',
        fontFamily: fontFamily.primary,
    },
    planInfo: {
        flex: 1,
        gap: 4,
    },
    planTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: colors.text.primary,
        fontFamily: fontFamily.primary,
    },
    planSubtitle: {
        fontSize: 12,
        fontWeight: '700',
        color: colors.text.primary,
        fontFamily: fontFamily.primary,
        opacity: 0.8,
    },
    planPriceContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    originalPrice: {
        fontSize: 16,
        fontWeight: '700',
        color: colors.text.secondary,
        textDecorationLine: 'line-through',
    },
    planPrice: {
        fontSize: 16,
        fontWeight: '700',
        color: colors.text.primary,
        fontFamily: fontFamily.primary,
    },
    // Footer - Standardized to match mainView
    footerContainer: {
        paddingHorizontal: 24,
        paddingTop: 32,
    },
    purchaseButton: {
        backgroundColor: colors.button.primary,
        borderRadius: 26,
        height: 52,
        justifyContent: 'center',
        alignItems: 'center',
    },
    purchaseButtonText: {
        color: colors.text.primary,
        fontSize: 15,
        fontWeight: '600',
        fontFamily: fontFamily.primary,
    },
});
