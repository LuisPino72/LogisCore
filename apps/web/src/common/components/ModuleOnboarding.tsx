import { useState, useEffect, type ReactNode } from 'react';
import { Button } from './Button';
import { X, ChevronRight, ChevronLeft, CheckCircle } from 'lucide-react';

interface OnboardingStep {
  title: string;
  description: string;
  icon: ReactNode;
}

interface ModuleOnboardingProps {
  moduleId: string;
  steps: OnboardingStep[];
  onComplete: () => void;
}

const STORAGE_KEY_PREFIX = 'logiscore-onboarding-';

function hasSeenOnboarding(moduleId: string): boolean {
  return localStorage.getItem(`${STORAGE_KEY_PREFIX}${moduleId}`) === 'true';
}

function markOnboardingSeen(moduleId: string): void {
  localStorage.setItem(`${STORAGE_KEY_PREFIX}${moduleId}`, 'true');
}

export function ModuleOnboarding({ moduleId, steps, onComplete }: ModuleOnboardingProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    if (!hasSeenOnboarding(moduleId)) {
      const timer = setTimeout(() => setIsOpen(true), 500);
      return () => clearTimeout(timer);
    }
  }, [moduleId]);

  const handleClose = () => {
    setIsOpen(false);
    markOnboardingSeen(moduleId);
    onComplete();
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      handleClose();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  if (!isOpen) return null;

  const step = steps[currentStep];
  const isLast = currentStep === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="bg-linear-to-br from-primary to-primary-dark p-5 text-white relative">
          <button
            onClick={handleClose}
            className="absolute top-3 right-3 p-2 rounded-full hover:bg-white/20 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Cerrar guía"
          >
            <X size={18} />
          </button>
          <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center mb-3">
            {step.icon}
          </div>
          <h2 className="text-xl font-title font-bold">{step.title}</h2>
        </div>

        {/* Body */}
        <div className="p-5">
          <p className="text-sm text-gray-600 leading-relaxed">{step.description}</p>

          {/* Progress dots */}
          <div className="flex items-center justify-center gap-2 mt-6">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === currentStep
                    ? 'w-6 bg-primary'
                    : i < currentStep
                    ? 'w-2 bg-primary/40'
                    : 'w-2 bg-gray-200'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex items-center gap-3">
          {currentStep > 0 && (
            <Button variant="ghost" onClick={handlePrev} className="min-h-[44px]">
              <ChevronLeft size={16} />
              Anterior
            </Button>
          )}
          <div className="flex-1" />
          <Button
            variant={isLast ? 'primary' : 'outline'}
            onClick={handleNext}
            className="min-h-[44px]"
          >
            {isLast ? (
              <>
                <CheckCircle size={16} />
                ¡Entendido!
              </>
            ) : (
              <>
                Siguiente
                <ChevronRight size={16} />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export { hasSeenOnboarding, markOnboardingSeen };
