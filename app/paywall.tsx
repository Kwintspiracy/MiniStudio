import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import Purchases, { PurchasesPackage } from 'react-native-purchases';
import Constants from 'expo-constants';
import { colors } from '../src/theme';
import { useEntitlements } from '../src/hooks/useEntitlements';
import { AppModal } from '../src/components/AppModal';

export default function PaywallScreen() {
  const router = useRouter();
  const { entitlements, refetch } = useEntitlements();
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);

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

  useEffect(() => {
    loadOfferings();
  }, []);

  // « Unlimited Access » n'a jamais rien recouvert : le webhook RevenueCat ne
  // pose jamais is_unlimited, et aucun compte en base ne porte ce drapeau. Les
  // libelles disent maintenant ce qui est reellement verse — 60 tokens par mois,
  // 720 d'un coup sur l'annuel, puisque RENEWAL n'y passe qu'une fois par an.
  // Ces nombres viennent de SUBSCRIPTION_TOKENS_BY_PRODUCT / TOKEN_PACK_MAP,
  // dans supabase/functions/revenuecat-webhook. Ne pas les modifier ici seul.
  const mockOfferings: any[] = __DEV__ ? [
    {
      identifier: 'Monthly',
      packageType: 'MONTHLY',
      product: { identifier: 'pro_monthly', description: '60 tokens every month', title: 'Pro Monthly (Mock)', price: 5.99, priceString: '$5.99', currencyCode: 'USD', productType: 'AUTO_RENEWABLE_SUBSCRIPTION' }
    },
    {
      identifier: 'Annual',
      packageType: 'ANNUAL',
      product: { identifier: 'pro_annual', description: '720 tokens, credited upfront', title: 'Pro Annual (Mock)', price: 53.88, priceString: '$53.88', currencyCode: 'USD', productType: 'AUTO_RENEWABLE_SUBSCRIPTION' }
    },
    {
      identifier: 'Tokens_100',
      packageType: 'CUSTOM',
      product: { identifier: 'tokens_100', description: '100 Tokens (Consumable)', title: '100 Tokens (Mock)', price: 14.99, priceString: '$14.99', currencyCode: 'USD', productType: 'CONSUMABLE' }
    }
  ] : [];

  const loadOfferings = async () => {
    try {
      const offerings = await Purchases.getOfferings();
      if (offerings.current && offerings.current.availablePackages.length !== 0) {
        setPackages(offerings.current.availablePackages);
      } else if (__DEV__) {
        setPackages(mockOfferings);
      }
    } catch (e) {
      if (__DEV__) {
        console.warn("Error fetching offerings (Native store may be missing)", e);
        setPackages(mockOfferings);
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async (pack: PurchasesPackage) => {
    if (purchasing) return;
    setPurchasing(true); // Start loading

    // INTERCEPT MOCK PACKAGES (dev only)
    if (__DEV__ && pack.product.title.includes("(Mock)")) {
        setTimeout(() => {
             setPurchasing(false);
             setPurchasing(false);
             showModal(
                "Simulated Purchase Successful",
                "You successfully simulated a purchase in Mock Mode. \n\n(No real money was charged. No backend update performed).",
                'default',
                {
                    label: "Continue",
                    onPress: () => {
                         if (pack.product.productType === 'AUTO_RENEWABLE_SUBSCRIPTION' || pack.packageType === 'MONTHLY') {
                             hideModal();
                             router.back();
                        } else {
                            // For mock token packs, we can't really update the balance, so just go back or stay
                            // Let's auto-close to mimic real behavior
                            hideModal();
                            router.back();
                        }
                    }
                }
            );
        }, 1000); // Fake delay
        return;
    }

    try {
      const { customerInfo } = await Purchases.purchasePackage(pack);
      
      // Trigger background refresh (non-blocking)
      refetch();

      if (pack.product.productType === 'NON_CONSUMABLE' || pack.packageType === 'ANNUAL' || pack.packageType === 'MONTHLY') {
          // purchasePackage resolved without throwing → the purchase succeeded.
          // The 'pro_access' entitlement may not have propagated yet, so always
          // give feedback (don't leave the user staring at the paywall after a
          // successful charge). Adapt the copy to the propagation state.
          const proActive = typeof customerInfo.entitlements.active['pro_access'] !== "undefined";
          showModal(
              "Success",
              proActive ? "Welcome to Pro!" : "Purchase complete! Your Pro access is activating…",
              'default',
              { label: "OK", onPress: () => {
                  hideModal();
                  router.back();
                  setTimeout(() => refetch(), 300);
              } }
          );
      } else {
          showModal("Success", "Tokens added!", 'default',
              { label: "OK", onPress: () => { 
                  hideModal(); 
                  router.back();
                  // Give modal time to close before refetching again
                  setTimeout(() => refetch(), 300);
              } } 
          );
      }
    } catch (e: any) {
      if (!e.userCancelled) {
        // Double check standard error code for cancellation (1) just in case
        // But usually userCancelled boolean is reliable
        if (e.message.includes("cancelled") || e.code === 1) {
             return; 
        }

        console.error(e);
        showModal("Error", e.message, 'error');
      }
    } finally {
      setPurchasing(false);
    }
  };

  const restorePurchases = async () => {
    setPurchasing(true);
    try {
      const customerInfo = await Purchases.restorePurchases();
      await refetch();
      if (typeof customerInfo.entitlements.active['pro_access'] !== "undefined") {
        // Defer router.back() to the modal's onPress, otherwise the screen
        // unmounts immediately and the success modal is never seen.
        showModal("Success", "Purchases restored!", 'default',
          { label: "OK", onPress: () => { hideModal(); router.back(); } }
        );
      } else {
        showModal("Info", "No active subscriptions found to restore.", 'default');
      }
    } catch (e: any) {
      showModal("Error", e.message, 'error');
    } finally {
      setPurchasing(false);
    }
  };

  // Group packages
  const subPackages = packages.filter(p => p.packageType === 'ANNUAL' || p.packageType === 'MONTHLY');
  const tokenPackages = packages.filter(p => !subPackages.includes(p));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
          <Ionicons name="close" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Store</Text>
        <View style={{flex: 1}} />
        <View style={styles.balanceBadge}>
            <Text style={styles.balanceText}>{(entitlements as any).remaining_total ?? entitlements.purchased_balance} Tokens</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        
        {/* SUBSCRIPTION SECTION */}
        <View style={styles.section}>
            <View style={styles.hero}>
            <Ionicons name="star" size={50} color={colors.accent.yellow} />
            <Text style={styles.heroTitle}>Upgrade to Pro</Text>
            <Text style={styles.heroSubtitle}>A monthly allowance of tokens, for Standard and Pro renders alike.</Text>
            </View>

            {/*
              Les trois arguments precedents etaient invendables et, pour deux
              d'entre eux, faux :
                « 10x Faster Generations »  — l'abonnement ne change pas le
                  temps de rendu ; le modele Pro est meme le plus lent des deux
                  (76 s contre 60 s en moyenne mesuree).
                « Higher Monthly Limits »   — la limite est le solde de tokens,
                  identique quelle que soit la facon dont on l'obtient.
                « All Styles Unlocked »     — aucun style n'est verrouille.
              Un motif de rejet en revue App Store, et un motif de remboursement.
              Ne sont annoncees ici que des choses que le code fait reellement.
            */}
            <View style={styles.features}>
                <FeatureRow icon="server" text="60 tokens every month" />
                <FeatureRow icon="sparkles" text="Pro renders: 3 tokens, best quality" />
                <FeatureRow icon="image" text="Standard renders: 1 token each" />
            </View>

            {loading ? (
                 <ActivityIndicator size="small" color={colors.button.primary} />
            ) : (
                <View style={styles.packages}>
                    {subPackages.map((pack) => (
                    <TouchableOpacity 
                        key={pack.identifier} 
                        style={styles.packageCard}
                        onPress={() => handlePurchase(pack)}
                        disabled={purchasing}
                    >
                        <View style={{flex: 1}}>
                            <Text style={styles.packageTitle}>{pack.product.title}</Text>
                            <Text style={styles.packageDesc}>{pack.product.description}</Text>
                        </View>
                        <Text style={styles.packagePrice}>{pack.product.priceString}</Text>
                    </TouchableOpacity>
                    ))}
                    {subPackages.length === 0 && !loading && (
                        <Text style={styles.emptyText}>No subscriptions available.</Text>
                    )}
                </View>
            )}

            
            {/* Dev/Expo Go Warning */}
            {Constants.appOwnership === 'expo' && (
                <View style={[styles.packageCard, { borderColor: colors.accent.blue, backgroundColor: colors.background.highlight }]}>
                     <View style={{flex: 1}}>
                        <Text style={{color: colors.text.primary, textAlign:'center', fontSize: 12}}>
                            Using RevenueCat Test Store (Expo Go Mode). Purchases are simulated.
                        </Text>
                     </View>
                </View>
            )}
        </View>

         {/* TOKEN SHOP SECTION */}
         <View style={[styles.section, { marginTop: 30 }]}>
            <Text style={styles.sectionHeader}>Token Packs</Text>
            <Text style={styles.sectionSubHeader}>Buy one-time tokens that never expire.</Text>
            
            <View style={styles.packages}>
                {tokenPackages.map((pack) => (
                <TouchableOpacity 
                    key={pack.identifier} 
                    style={styles.packageCard}
                    onPress={() => handlePurchase(pack)}
                    disabled={purchasing}
                >
                    <View style={{flex: 1}}>
                        <Text style={styles.packageTitle}>{pack.product.title}</Text>
                        <Text style={styles.packageDesc}>{pack.product.description}</Text>
                    </View>
                    <View style={styles.buyButton}>
                         <Text style={styles.buyButtonText}>{pack.product.priceString}</Text>
                    </View>
                </TouchableOpacity>
                ))}
                 {tokenPackages.length === 0 && !loading && (
                        <Text style={styles.emptyText}>No token packs available.</Text>
                 )}
            </View>
        </View>

      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity onPress={restorePurchases} disabled={purchasing}>
          <Text style={styles.restoreText}>Restore Purchases</Text>
        </TouchableOpacity>
        <Text style={styles.legalText}>
            Recurring billing, cancel anytime.
        </Text>
      </View>
      
      {purchasing && (
        <View style={styles.overlay}>
             <ActivityIndicator size="large" color={colors.palette.white} />
             <Text style={{color: colors.palette.white, marginTop: 16, fontWeight: '600'}}>Finalizing Purchase...</Text>
        </View>
      )}

      <AppModal
        visible={modalConfig.visible}
        onClose={hideModal}
        title={modalConfig.title}
        message={modalConfig.message}
        type={modalConfig.type}
        primaryAction={modalConfig.primaryAction ? {
            ...modalConfig.primaryAction,
            onPress: () => {
                modalConfig.primaryAction?.onPress();
                hideModal();
            }
        } : { label: "OK", onPress: hideModal }}
        secondaryAction={modalConfig.secondaryAction ? {
            ...modalConfig.secondaryAction,
            onPress: () => {
                modalConfig.secondaryAction?.onPress();
                hideModal();
            }
        } : undefined}
      />
    </View>
  );
}

function FeatureRow({ icon, text }: { icon: any, text: string }) {
    return (
        <View style={styles.featureRow}>
            <Ionicons name={icon} size={20} color={colors.accent.blue} style={{ marginRight: 12 }} />
            <Text style={styles.featureText}>{text}</Text>
        </View>
    )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  closeButton: {
    padding: 5,
  },
  headerTitle: {
    color: colors.text.primary,
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 20,
  },
  balanceBadge: {
      backgroundColor: colors.background.tertiary,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
  },
  balanceText: {
      color: colors.text.primary,
      fontWeight: 'bold',
      fontSize: 12,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  section: {
      marginBottom: 20,
  },
  hero: {
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 20,
  },
  heroTitle: {
    color: colors.text.primary,
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  heroSubtitle: {
    color: colors.text.secondary,
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  features: {
    marginBottom: 24,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: colors.background.secondary,
    padding: 12,
    borderRadius: 8,
  },
  featureText: {
    color: colors.text.primary,
    fontSize: 14,
    fontWeight: '500',
  },
  sectionHeader: {
      color: colors.text.primary,
      fontSize: 20,
      fontWeight: 'bold',
      marginBottom: 4,
  },
  sectionSubHeader: {
      color: colors.text.secondary,
      fontSize: 14,
      marginBottom: 16,
  },
  packages: {
    gap: 12,
  },
  packageCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.background.secondary,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  packageTitle: {
    color: colors.text.primary,
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  packageDesc: {
    color: colors.text.secondary,
    fontSize: 12,
    marginRight: 10,
  },
  packagePrice: {
    color: colors.accent.blue,
    fontSize: 16,
    fontWeight: 'bold',
  },
  buyButton: {
      backgroundColor: colors.button.primary,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 8,
  },
  buyButtonText: {
      color: colors.palette.white,
      fontWeight: 'bold',
      fontSize: 14,
  },
  emptyText: {
      color: colors.text.secondary,
      textAlign: 'center',
      fontStyle: 'italic',
  },
  footer: {
    padding: 20,
    alignItems: 'center',
    gap: 15,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
  },
  restoreText: {
    color: colors.text.secondary,
    textDecorationLine: 'underline',
    fontSize: 14,
  },
  legalText: {
    color: colors.text.secondary,
    fontSize: 12,
  },
  overlay: {
    // Basic absolute fill manually if ViewStyle doesn't support ...StyleSheet.absoluteFillObject spread spread in strict TS?? 
    // Actually absoluteFillObject is fine, but let's be explicit to avoid "cursor" issues if any.
    position: 'absolute',
    top: 0, 
    left: 0, 
    right: 0, 
    bottom: 0,
    backgroundColor: colors.overlay.modal,
    justifyContent: 'center',
    alignItems: 'center',
  }
});
