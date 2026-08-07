import { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { ImageBackground } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Button, Text, useTheme } from 'react-native-paper';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { Anime } from '../types';
import { tokens } from '../theme';

type Props = {
  items: Anime[];
  width: number;
  height: number;
  onOpen: (anime: Anime) => void;
  onWatch: (anime: Anime) => void;
};

export function FeaturedCarousel({ items, width, height, onOpen, onWatch }: Props) {
  const theme = useTheme();
  const list = useRef<FlatList<Anime>>(null);
  const interacting = useRef(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const activeIndexRef = useRef(0);
  const slides = items.slice(0, 5);

  useEffect(() => {
    activeIndexRef.current = Math.min(activeIndexRef.current, Math.max(0, slides.length - 1));
    setActiveIndex(activeIndexRef.current);
  }, [slides.length]);

  useEffect(() => {
    if (slides.length < 2) return undefined;
    const timer = setInterval(() => {
      if (interacting.current) return;
      const next = (activeIndexRef.current + 1) % slides.length;
      activeIndexRef.current = next;
      setActiveIndex(next);
      list.current?.scrollToIndex({ index: next, animated: true });
    }, 5_500);
    return () => clearInterval(timer);
  }, [slides.length, width]);

  const settle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.max(0, Math.min(slides.length - 1, Math.round(event.nativeEvent.contentOffset.x / width)));
    activeIndexRef.current = next;
    setActiveIndex(next);
    interacting.current = false;
  };

  if (!slides.length) return null;
  return (
    <View style={styles.root} accessibilityRole="adjustable" accessibilityLabel={`Featured titles, item ${activeIndex + 1} of ${slides.length}`}>
      <FlatList
        ref={list}
        data={slides}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => `hero-${item.metadataProvider || 'media'}-${item.id}`}
        getItemLayout={(_data, index) => ({ length: width, offset: width * index, index })}
        onMomentumScrollEnd={settle}
        onScrollBeginDrag={() => { interacting.current = true; }}
        onScrollEndDrag={() => { setTimeout(() => { interacting.current = false; }, 800); }}
        onScrollToIndexFailed={({ index }) => list.current?.scrollToOffset({ offset: width * index, animated: true })}
        renderItem={({ item }) => (
          <Pressable onPress={() => onOpen(item)} style={({ pressed }) => [{ width, height }, styles.slide, { opacity: pressed ? 0.94 : 1 }]} accessibilityRole="button" accessibilityLabel={`${item.title}. Featured title`} accessibilityHint="Opens the watch experience">
            <ImageBackground source={item.banner || item.cover} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" priority="high" accessibilityIgnoresInvertColors />
            <LinearGradient colors={['rgba(2,2,3,0.04)', 'rgba(2,2,3,0.34)', 'rgba(2,2,3,0.98)']} locations={[0.12, 0.48, 0.88]} style={StyleSheet.absoluteFill} />
            <LinearGradient colors={['rgba(105,4,28,0.08)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 0.8, y: 0 }} style={StyleSheet.absoluteFill} />
            <View style={styles.copy}>
              <View style={styles.factualLabel}>
                <MaterialCommunityIcons name="chart-line" size={14} color={theme.colors.primary} />
                <Text variant="labelMedium" style={{ color: theme.colors.onSurface }}>Trending now</Text>
              </View>
              <Text variant="headlineMedium" numberOfLines={2} style={styles.title}>{item.title}</Text>
              <View style={styles.metadata}>
                {item.score ? <><MaterialCommunityIcons name="star" size={15} color={tokens.color.warning} /><Text variant="labelLarge" style={styles.metaText}>{item.score.toFixed(1)}</Text></> : null}
                {[item.format?.replaceAll('_', ' '), item.year].filter(Boolean).map((value) => <Text key={String(value)} variant="labelLarge" style={styles.metaText}>· {value}</Text>)}
              </View>
              <View style={styles.actions}>
                <Button mode="contained" icon="play" onPress={(event) => { event.stopPropagation(); onWatch(item); }} contentStyle={styles.buttonContent}>Watch now</Button>
              </View>
            </View>
          </Pressable>
        )}
      />
      {slides.length > 1 ? (
        <View style={styles.indicators}>
          {slides.map((item, index) => <View key={`indicator-${item.id}`} style={[styles.indicator, { backgroundColor: index === activeIndex ? theme.colors.primary : 'rgba(255,255,255,0.30)', width: index === activeIndex ? 22 : 6 }]} />)}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { marginHorizontal: -tokens.spacing.lg, overflow: 'hidden', backgroundColor: tokens.color.surface },
  slide: { justifyContent: 'flex-end' },
  copy: { paddingHorizontal: tokens.spacing.lg, paddingBottom: 34, gap: tokens.spacing.sm, maxWidth: 430 },
  factualLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { color: '#FFFFFF', fontWeight: '700', letterSpacing: -0.5, lineHeight: 33 },
  metadata: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  metaText: { color: '#E8E1E4' },
  actions: { flexDirection: 'row', gap: tokens.spacing.sm, marginTop: tokens.spacing.xs },
  buttonContent: { minHeight: 42 },
  indicators: { position: 'absolute', left: tokens.spacing.lg, bottom: 14, flexDirection: 'row', alignItems: 'center', gap: 6 },
  indicator: { height: 3, borderRadius: tokens.radius.pill },
});
