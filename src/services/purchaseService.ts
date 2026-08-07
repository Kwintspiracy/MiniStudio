import Purchases, { PurchasesPackage, PurchasesOffering } from 'react-native-purchases';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const REVENUECAT_API_KEY_APPLE = Constants.expoConfig?.extra?.revenueCat?.apple;
const REVENUECAT_API_KEY_GOOGLE = Constants.expoConfig?.extra?.revenueCat?.google;

export interface SimplifiedPackage {
    identifier: string;
    product: {
        identifier: string;
        title: string;
        description: string;
        price: number;
        priceString: string;
        currencyCode: string;
        productType: 'AUTO_RENEWABLE_SUBSCRIPTION' | 'CONSUMABLE' | 'NON_CONSUMABLE' | 'NON_RENEWABLE_SUBSCRIPTION' | 'UNKNOWN';
    };
    packageType: string;
}

const OFFERINGS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

class PurchaseService {
    private initialized = false;
    private isMock = false; // Flag to force mock mode if needed
    private offeringsCache: { packages: PurchasesPackage[]; ts: number } | null = null;

    constructor() {
        if (__DEV__) {
            console.log('[PurchaseService] Running in Development/Expo mode.');
        }
    }

    async init() {
        if (this.initialized) return;

        const apiKey = Platform.select({
            ios: REVENUECAT_API_KEY_APPLE,
            android: REVENUECAT_API_KEY_GOOGLE,
        });

        if (!apiKey) {
            if (__DEV__) console.warn('[PurchaseService] No RevenueCat API Key found. Falling back to Mock Mode.');
            this.isMock = true;
            this.initialized = true;
            return;
        }

        try {
            if (Platform.OS === 'web') {
                if (__DEV__) console.warn('[PurchaseService] Web not supported for RevenueCat. Using Mock Mode.');
                this.isMock = true;
            } else {
                // RevenueCat must be configured exactly once per process. RootLayout
                // already calls Purchases.configure() at startup, so only configure
                // here if it hasn't happened yet (e.g. service used before layout mount).
                // Calling configure() twice triggers SDK warnings and can reset the
                // cached customer/offerings state, causing flaky purchases on device.
                const alreadyConfigured =
                    typeof Purchases.isConfigured === 'function'
                        ? await Purchases.isConfigured()
                        : false;
                if (!alreadyConfigured) {
                    await Purchases.configure({ apiKey });
                }
                this.initialized = true;
                if (__DEV__) console.log(`[PurchaseService] RevenueCat ready (configured here: ${!alreadyConfigured}).`);
            }
        } catch (e) {
            console.error('[PurchaseService] Failed to initialize RevenueCat:', e);
            this.isMock = true;
        }
    }

    async getOfferings(): Promise<PurchasesPackage[]> {
        if (!this.initialized) await this.init();

        if (this.isMock) {
            if (__DEV__) return this.getMockPackages();
            return [];
        }

        // Return in-memory cached offerings if still fresh
        if (this.offeringsCache && Date.now() - this.offeringsCache.ts < OFFERINGS_CACHE_TTL_MS) {
            if (__DEV__) console.log('[PurchaseService] Returning cached offerings');
            return this.offeringsCache.packages;
        }

        try {
            const offerings = await Purchases.getOfferings();
            if (offerings.current && offerings.current.availablePackages.length > 0) {
                const packages = offerings.current.availablePackages;
                this.offeringsCache = { packages, ts: Date.now() };
                return packages;
            } else {
                if (__DEV__) {
                    console.warn('[PurchaseService] No offerings found in RevenueCat. Using Mock data.');
                    return this.getMockPackages();
                }
                return [];
            }
        } catch (e) {
            if (__DEV__) {
                console.warn('[PurchaseService] Error fetching offerings:', e);
                return this.getMockPackages();
            }
            return [];
        }
    }

    async purchasePackage(pack: PurchasesPackage): Promise<{ success: boolean; customerInfo?: any; error?: any; isMock?: boolean }> {
        if (!this.initialized) await this.init();

        // Allow mock purchases only in dev mode
        if (__DEV__ && (this.isMock || pack.product.title.includes("(Mock)"))) {
            if (__DEV__) console.log('[PurchaseService] Simulating purchase for:', pack.product.identifier);
            return new Promise((resolve) => {
                setTimeout(() => {
                    resolve({ success: true, isMock: true });
                }, 1000); // Simulate network delay
            });
        }

        // 2. Real Purchase
        try {
            const { customerInfo } = await Purchases.purchasePackage(pack);
            return { success: true, customerInfo };
        } catch (e: any) {
             if (e.userCancelled) {
                return { success: false, error: 'cancelled' };
             }
             return { success: false, error: e };
        }
    }

    private getMockPackages(): PurchasesPackage[] {
        // Return fully compliant PurchasesPackage objects (casted as any to strict types)
        return [
            {
                identifier: '$rc_monthly',
                packageType: 'MONTHLY',
                product: {
                    identifier: 'pro_monthly',
                    description: '60 tokens every month',
                    title: 'Monthly (Mock)',
                    price: 5.99,
                    priceString: '$5.99',
                    currencyCode: 'USD',
                    productType: 'AUTO_RENEWABLE_SUBSCRIPTION',
                },
                offeringIdentifier: 'default'
            },
            {
                identifier: '$rc_annual',
                packageType: 'ANNUAL',
                product: {
                    identifier: 'pro_annual',
                    // 720 d'un coup : RENEWAL ne se declenche qu'une fois par an
                    // sur un abonnement annuel, les tokens sont donc verses en
                    // une seule fois. Bareme dans revenuecat-webhook.
                    description: '720 tokens, credited upfront',
                    title: 'Annual (Mock)',
                    price: 53.88,
                    priceString: '$53.88',
                    currencyCode: 'USD',
                    productType: 'AUTO_RENEWABLE_SUBSCRIPTION',
                },
                offeringIdentifier: 'default'
            },
            {
                identifier: 'Tokens_100',
                packageType: 'CUSTOM',
                product: {
                    identifier: 'tokens_100',
                    description: '100 Tokens',
                    title: 'Pack of Tokens (Mock)',
                    price: 14.99,
                    priceString: '$14.99',
                    currencyCode: 'USD',
                    productType: 'CONSUMABLE',
                },
                offeringIdentifier: 'default'
            }
        ] as any;
    }
}

export const purchaseService = new PurchaseService();
