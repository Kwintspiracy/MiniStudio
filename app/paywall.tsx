import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Purchases, { PurchasesPackage } from 'react-native-purchases';
import Constants from 'expo-constants';
import { colors } from '../src/theme';
import { useEntitlements } from '../src/hooks/useEntitlements';

export default function PaywallScreen() {
  const router = useRouter();
  const { entitlements, refetch } = useEntitlements();
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);

  useEffect(() => {
    loadOfferings();
  }, []);

  const loadOfferings = async () => {
    try {
      const offerings = await Purchases.getOfferings();
      if (offerings.current && offerings.current.availablePackages.length !== 0) {
        setPackages(offerings.current.availablePackages);
      } else {
          // MOCK DATA FALLBACK (For UI Development when Apple Blocked)
           console.log("Using Mock Offerings for UI Dev");
           setPackages([
               {
                   identifier: 'Monthly',
                   packageType: 'MONTHLY',
                   product: {
                       identifier: 'pro_monthly',
                       description: 'Unlimited Access + 100 Tokens/mo',
                       title: 'Pro Monthly (Mock)',
                       price: 9.99,
                       priceString: '$9.99',
                       currencyCode: 'USD',
                       productType: 'AUTO_RENEWABLE_SUBSCRIPTION',
                   }
               },
               {
                   identifier: 'Tokens_200',
                   packageType: 'CUSTOM',
                   product: {
                       identifier: 'tokens_200',
                       description: '200 Tokens (Consumable)',
                       title: '200 Tokens (Mock)',
                       price: 14.99,
                       priceString: '$14.99',
                       currencyCode: 'USD',
                       productType: 'CONSUMABLE', // or NON_RENEWING_SUBSCRIPTION if that's what we call it
                   }
               }
           ] as any);
      }
    } catch (e) {
      console.warn("Error fetching offerings (Native store may be missing)", e);
      // Fallback on error too
       console.log("Using Mock Offerings due to Error");
           setPackages([
               {
                   identifier: 'Monthly',
                   packageType: 'MONTHLY',
                   product: { identifier: 'pro_monthly', description: 'Unlimited Access + 100 Tokens/mo', title: 'Pro Monthly (Mock)', priceString: '$9.99', productType: 'AUTO_RENEWABLE_SUBSCRIPTION' }
               },
               {
                   identifier: 'Tokens_200',
                   packageType: 'CUSTOM',
                   product: { identifier: 'tokens_200', description: '200 Tokens', title: '200 Tokens (Mock)', priceString: '$14.99', productType: 'CONSUMABLE' }
               }
           ] as any);
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async (pack: PurchasesPackage) => {
    if (purchasing) return;
    setPurchasing(true); // Start loading

    // INTERCEPT MOCK PACKAGES
    if (pack.product.title.includes("(Mock)")) {
        setTimeout(() => {
             setPurchasing(false);
             Alert.alert(
                "Simulated Purchase Successful",
                "You successfully simulated a purchase in Mock Mode. \n\n(No real money was charged. No backend update performed).",
                [
                    {
                        text: "Continue",
                        onPress: () => {
                             if (pack.product.productType === 'AUTO_RENEWABLE_SUBSCRIPTION' || pack.packageType === 'MONTHLY') {
                                router.back();
                            } else {
                                // For mock token packs, we can't really update the balance, so just go back or stay
                                // Let's auto-close to mimic real behavior
                                router.back();
                            }
                        }
                    }
                ]
            );
        }, 1000); // Fake delay
        return;
    }

    try {
      const { customerInfo } = await Purchases.purchasePackage(pack);
      
      // -- LATENCY MASKING START --
      // We know RevenueCat succeeded, but the Webhook -> Supabase -> DB Update takes 2-5s.
      // We will perform a few "optimistic" fetches to see if the balance updates.
      // Even if it doesn't match yet, we wait a bit to give it a chance.
      
      // Wait Loop (3 attempts of 1.5s = 4.5s max wait)
      for (let i = 0; i < 3; i++) {
        await new Promise(r => setTimeout(r, 1500));
        await refetch();
        // Ideally we check if balance increased, but we don't have previous balance handy here easily
        // without more state. Just the delay helps.
      }
      
      // Final fetch
      await refetch();
      // -- LATENCY MASKING END --

      if (pack.product.productType === 'NON_CONSUMABLE' || pack.packageType === 'ANNUAL' || pack.packageType === 'MONTHLY') {
          // Check for entitlement OR if in Expo Go/Test Store (where entitlements might not sync immediately)
          if (typeof customerInfo.entitlements.active['pro_access'] !== "undefined" || Constants.appOwnership === 'expo') {
            Alert.alert("Success", "Welcome to Pro! (Test Store Verified)", [
                { text: "OK", onPress: () => router.back() }
            ]);
          }
      } else {
          Alert.alert("Success", "Tokens added!", [
              { text: "OK", onPress: () => router.back() } 
          ]);
      }
    } catch (e: any) {
      if (!e.userCancelled) {
        // Double check standard error code for cancellation (1) just in case
        // But usually userCancelled boolean is reliable
        if (e.message.includes("cancelled") || e.code === 1) {
             return; 
        }

        // Special Handling for Expo Go / Test Store (Loose equality for code)
        if (Constants.appOwnership === 'expo' && (e.code == 5 || e.code === '5')) {
            Alert.alert(
                "Simulated Purchase Successful",
                "You successfully simulated a purchase in the Test Store. \n\n(No real money was charged. Entitlements may not update in Expo Go).",
                [
                    {
                        text: "Continue Test",
                        onPress: () => {
                             // Wait & Poll for Expo Sim too
                             setTimeout(() => {
                                 router.back();
                             }, 1000);
                        }
                    }
                ]
            );
            return;
        }

        console.error(e);
        Alert.alert("Error", e.message);
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
        Alert.alert("Success", "Purchases restored!");
        router.back();
      } else {
        Alert.alert("Info", "No active subscriptions found to restore.");
      }
    } catch (e: any) {
      Alert.alert("Error", e.message);
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
            <Text style={styles.balanceText}>{entitlements.purchased_balance} Tokens</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        
        {/* SUBSCRIPTION SECTION */}
        <View style={styles.section}>
            <View style={styles.hero}>
            <Ionicons name="star" size={50} color={colors.accent.yellow} />
            <Text style={styles.heroTitle}>Upgrade to Pro</Text>
            <Text style={styles.heroSubtitle}>Unlock faster generations, higher limits, and all styles.</Text>
            </View>

            <View style={styles.features}>
                <FeatureRow icon="flash" text="10x Faster Generations" />
                <FeatureRow icon="infinite" text="Higher Monthly Limits" />
                <FeatureRow icon="color-palette" text="All Styles Unlocked" />
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
