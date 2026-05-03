import { useEffect, useRef } from "react";

function useSectionSnap(sectionRefs, activeIndex, setActiveIndex) {
  const activeIndexRef = useRef(activeIndex);
  const lockedRef = useRef(false);
  const wheelAccumulatorRef = useRef(0);
  const touchStartYRef = useRef(0);
  const wheelResetTimerRef = useRef(null);
  const lockReleaseTimerRef = useRef(null);
  const scrollEndTimerRef = useRef(null);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    const sections = sectionRefs.current.filter(Boolean);
    if (!sections.length) {
      return undefined;
    }

    const getSectionTop = (section) =>
      Math.round(section.getBoundingClientRect().top + window.scrollY);

    const isAlignedToIndex = (index) =>
      Math.abs(window.scrollY - getSectionTop(sections[index])) < 2;

    const getClosestSectionIndex = () => {
      const viewportAnchor = window.scrollY + window.innerHeight / 2;
      let closestIndex = 0;
      let smallestDistance = Number.POSITIVE_INFINITY;

      sections.forEach((section, index) => {
        const sectionCenter = getSectionTop(section) + section.offsetHeight / 2;
        const distance = Math.abs(sectionCenter - viewportAnchor);

        if (distance < smallestDistance) {
          smallestDistance = distance;
          closestIndex = index;
        }
      });

      return closestIndex;
    };

    const syncActiveIndexToViewport = () => {
      const closestIndex = getClosestSectionIndex();
      if (closestIndex !== activeIndexRef.current) {
        activeIndexRef.current = closestIndex;
        setActiveIndex(closestIndex);
      }

      return closestIndex;
    };

    const goToIndex = (index, options = {}) => {
      const { behavior = "smooth", force = false } = options;
      const clampedIndex = Math.max(0, Math.min(index, sections.length - 1));
      if (lockedRef.current && !force) {
        return;
      }

      if (
        clampedIndex === activeIndexRef.current &&
        isAlignedToIndex(clampedIndex) &&
        !force
      ) {
        return;
      }

      window.clearTimeout(lockReleaseTimerRef.current);
      lockedRef.current = true;
      activeIndexRef.current = clampedIndex;
      setActiveIndex(clampedIndex);
      const targetTop = getSectionTop(sections[clampedIndex]);

      window.scrollTo({
        top: targetTop,
        behavior,
      });

      lockReleaseTimerRef.current = window.setTimeout(() => {
        window.scrollTo({
          top: targetTop,
          behavior: "auto",
        });
        lockedRef.current = false;
      }, behavior === "smooth" ? 420 : 0);
    };

    const snapToClosestSection = () => {
      const closestIndex = syncActiveIndexToViewport();
      if (!isAlignedToIndex(closestIndex)) {
        goToIndex(closestIndex, { force: true });
      }
    };

    const handleWheel = (event) => {
      if (lockedRef.current) {
        return;
      }

      event.preventDefault();
      syncActiveIndexToViewport();
      wheelAccumulatorRef.current += event.deltaY;

      window.clearTimeout(wheelResetTimerRef.current);
      wheelResetTimerRef.current = window.setTimeout(() => {
        wheelAccumulatorRef.current = 0;
      }, 120);

      if (Math.abs(wheelAccumulatorRef.current) < 12) {
        return;
      }

      goToIndex(activeIndexRef.current + (wheelAccumulatorRef.current > 0 ? 1 : -1));
      wheelAccumulatorRef.current = 0;
    };

    const handleKeyDown = (event) => {
      if (lockedRef.current) {
        return;
      }

      const currentIndex = syncActiveIndexToViewport();

      if (["ArrowDown", "PageDown", " "].includes(event.key)) {
        event.preventDefault();
        goToIndex(currentIndex + 1);
      }

      if (["ArrowUp", "PageUp"].includes(event.key)) {
        event.preventDefault();
        goToIndex(currentIndex - 1);
      }
    };

    const handleTouchStart = (event) => {
      touchStartYRef.current = event.touches[0].clientY;
    };

    const handleTouchEnd = (event) => {
      const swipeDistance = touchStartYRef.current - event.changedTouches[0].clientY;
      if (lockedRef.current || Math.abs(swipeDistance) < 30) {
        return;
      }

      const currentIndex = syncActiveIndexToViewport();
      goToIndex(currentIndex + (swipeDistance > 0 ? 1 : -1));
    };

    const alignActiveSection = () => {
      const activeSection = sections[activeIndexRef.current];
      if (!activeSection || lockedRef.current) {
        return;
      }

      window.scrollTo({
        top: getSectionTop(activeSection),
        behavior: "auto",
      });
    };

    const handleScroll = () => {
      window.clearTimeout(scrollEndTimerRef.current);
      scrollEndTimerRef.current = window.setTimeout(() => {
        if (!lockedRef.current) {
          snapToClosestSection();
        }
      }, 120);
    };

    window.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    window.addEventListener("resize", alignActiveSection);

    return () => {
      window.clearTimeout(wheelResetTimerRef.current);
      window.clearTimeout(lockReleaseTimerRef.current);
      window.clearTimeout(scrollEndTimerRef.current);
      window.removeEventListener("wheel", handleWheel);
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("resize", alignActiveSection);
    };
  }, [sectionRefs, setActiveIndex]);
}

export default useSectionSnap;
