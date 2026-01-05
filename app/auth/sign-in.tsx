import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Image, Alert } from 'react-native';
import { Link, router } from 'expo-router';
import { supabase } from '../../src/services/supabase';
import { useAuth } from '../../src/context/AuthContext';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SignInScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const { signInWithGoogle } = useAuth();

    const handleSignIn = async () => {
        setLoading(true);
        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            Alert.alert('Sign In Error', error.message);
        } else {
            // AuthProvider listener will handle redirect
        }
        setLoading(false);
    };

    return (
        <SafeAreaView className="flex-1 bg-[#0D1117] justify-center px-6">
            <View className="items-center mb-8">
                <Text className="text-3xl font-black text-white italic tracking-tighter">
                    MINI<Text className="text-indigo-500">STUDIO</Text>
                </Text>
                <Text className="text-zinc-500 text-xs tracking-widest uppercase mt-1">
                    Authentication
                </Text>
            </View>

            <View className="space-y-4">
                <View>
                    <Text className="text-zinc-400 text-xs uppercase font-bold mb-2 ml-1">Email</Text>
                    <TextInput
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-white"
                        placeholder="paintmaster@example.com"
                        placeholderTextColor="#52525b"
                        value={email}
                        onChangeText={setEmail}
                        autoCapitalize="none"
                    />
                </View>

                <View className="mt-4">
                    <Text className="text-zinc-400 text-xs uppercase font-bold mb-2 ml-1">Password</Text>
                    <TextInput
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-white"
                        placeholder="••••••••"
                        placeholderTextColor="#52525b"
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry
                    />
                </View>

                <TouchableOpacity
                    onPress={handleSignIn}
                    disabled={loading}
                    className={`w-full py-4 rounded-xl mt-6 items-center ${loading ? 'bg-indigo-800' : 'bg-indigo-600'}`}
                >
                    <Text className="text-white font-bold uppercase tracking-widest text-sm">
                        {loading ? 'Signing In...' : 'Sign In'}
                    </Text>
                </TouchableOpacity>

                <View className="flex-row items-center my-6">
                    <View className="flex-1 h-[1px] bg-zinc-800" />
                    <Text className="mx-4 text-zinc-600 text-xs uppercase">Or continue with</Text>
                    <View className="flex-1 h-[1px] bg-zinc-800" />
                </View>

                <TouchableOpacity
                    onPress={signInWithGoogle}
                    className="w-full py-4 rounded-xl bg-white flex-row items-center justify-center space-x-2"
                >
                    {/* Simple G icon representation */}
                    <Text className="text-black font-bold text-lg">G</Text>
                    <Text className="text-black font-bold uppercase tracking-widest text-sm ml-2">
                        Google
                    </Text>
                </TouchableOpacity>

                <View className="flex-row justify-center mt-8">
                    <Text className="text-zinc-500 text-sm">Don't have an account? </Text>
                    <Link href="/auth/sign-up" asChild>
                        <TouchableOpacity>
                            <Text className="text-indigo-400 text-sm font-bold">Sign Up</Text>
                        </TouchableOpacity>
                    </Link>
                </View>
            </View>
        </SafeAreaView>
    );
}
