import { BrandGradientText } from "@verkli/web";

// Wraps GradientText (motion/react) with the Verkli brand ramp
// #907aff -> #e29ed5 -> #fcc997. Renders as animated gradient text.
export function Headline() {
  return (
    <p className="text-3xl font-semibold">
      <BrandGradientText>Publishing, without the publisher</BrandGradientText>
    </p>
  );
}

export function InlineInSentence() {
  return (
    <p className="text-page-title">
      Write once. <BrandGradientText>Reach everywhere.</BrandGradientText>
    </p>
  );
}

export function CustomColors() {
  return (
    <p className="text-3xl font-semibold">
      <BrandGradientText colors={["#907aff", "#fcc997"]} animationSpeed={4}>
        Two-stop ramp
      </BrandGradientText>
    </p>
  );
}
