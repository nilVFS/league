import { useEffect, useRef } from "react";

function useSectionSnap(sectionRefs, activeIndex, setActiveIndex) {
  const activeIndexRef = useRef(activeIndex);
  const lockedRef = useRef(false);
  const wheelAccumulatorRef = useRef(0);
  const touchStartYRef = useRef(0);
  const wheelResetTimerRef = useRef(null);

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

    const goToIndex = (index) => {
      const clampedIndex = Math.max(0, Math.min(index, sections.length - 1));
      if (clampedIndex === activeIndexRef.current || lockedRef.current) {
        return;
      }

      lockedRef.current = true;
      setActiveIndex(clampedIndex);
      window.scrollTo({
        top: getSectionTop(sections[clampedIndex]),
        behavior: "smooth",
      });

      window.setTimeout(() => {
        lockedRef.current = false;
      }, 650);
    };

    const handleWheel = (event) => {
      if (lockedRef.current) {
        return;
      }

      event.preventDefault();
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

      if (["ArrowDown", "PageDown", " "].includes(event.key)) {
        event.preventDefault();
        goToIndex(activeIndexRef.current + 1);
      }

      if (["ArrowUp", "PageUp"].includes(event.key)) {
        event.preventDefault();
        goToIndex(activeIndexRef.current - 1);
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

      goToIndex(activeIndexRef.current + (swipeDistance > 0 ? 1 : -1));
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

    window.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    window.addEventListener("resize", alignActiveSection);

    return () => {
      window.clearTimeout(wheelResetTimerRef.current);
      window.removeEventListener("wheel", handleWheel);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("resize", alignActiveSection);
    };
  }, [sectionRefs, setActiveIndex]);
}

export default useSectionSnap;
