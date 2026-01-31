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

class PurchaseService {
    private initialized = false;
    private isMock = false; // Flag to force mock mode if needed

    constructor() {
        // Auto-detect mock mode if running in Expo Go without keys or ownership is expo
        // This is heuristic; adjust based on real requirements
        if (Constants.appOwnership === 'expo' || __DEV__) {
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
            console.warn('[PurchaseService] No RevenueCat API Key found. Falling back to Mock Mode.');
            this.isMock = true;
            this.initialized = true;
            return;
        }

        try {
            if (Platform.OS === 'web') {
                 console.warn('[PurchaseService] Web not supported for RevenueCat. Using Mock Mode.');
                 this.isMock = true;
            } else {
                await Purchases.configure({ apiKey });
                this.initialized = true;
                console.log('[PurchaseService] Initialized RevenueCat.');
            }
        } catch (e) {
            console.error('[PurchaseService] Failed to initialize RevenueCat:', e);
            this.isMock = true;
        }
    }

    async getOfferings(): Promise<PurchasesPackage[]> {
        if (!this.initialized) await this.init();

        if (this.isMock) {
            return this.getMockPackages();
        }

        try {
            const offerings = await Purchases.getOfferings();
            if (offerings.current && offerings.current.availablePackages.length > 0) {
                return offerings.current.availablePackages;
            } else {
                console.warn('[PurchaseService] No offerings found in RevenueCat. Using Mock data.');
                return this.getMockPackages();
            }
        } catch (e) {
            console.warn('[PurchaseService] Error fetching offerings:', e);
            return this.getMockPackages();
        }
    }

    async purchasePackage(pack: PurchasesPackage): Promise<{ success: boolean; customerInfo?: any; error?: any; isMock?: boolean }> {
        if (!this.initialized) await this.init();

        // 1. Check for Mock Package or Mock Mode
        // We identify mock packages by a special flag or just falling back if isMock is true
        // Also check if the 'product' title contains "(Mock)" as seen in legacy code
        if (this.isMock || pack.product.title.includes("(Mock)")) {
            console.log('[PurchaseService] Simulating purchase for:', pack.product.identifier);
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
                    description: '60 Monthly Tokens',
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
                    description: '60 Monthly Tokens',
                    title: 'Annual (Mock)',
                    price: 53.88,
                    priceString: '$53.88',
                    currencyCode: 'USD',
                    productType: 'AUTO_RENEWABLE_SUBSCRIPTION',
                },
                offeringIdentifier: 'default'
            },
            {
                identifier: 'Tokens_200',
                packageType: 'CUSTOM',
                product: {
                    identifier: 'tokens_200',
                    description: '200 Tokens',
                    title: 'Pack of Tokens (Mock)',
                    price: 17.99,
                    priceString: '$17.99',
                    currencyCode: 'USD',
                    productType: 'CONSUMABLE',
                },
                offeringIdentifier: 'default'
            }
        ] as any;
    }
}

export const purchaseService = new PurchaseService();
