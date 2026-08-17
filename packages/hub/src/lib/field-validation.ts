import * as React from "react";

export type FieldValidationResult = boolean | string | string[] | undefined;

export type FieldValidationController = {
  validate: () => FieldValidationResult | Promise<FieldValidationResult>;
};

export type FieldValidationSlot = {
  register: (controller: FieldValidationController) => () => void;
  validate: () => FieldValidationResult | Promise<FieldValidationResult>;
};

export const FieldValidationSlotContext =
  React.createContext<FieldValidationSlot | null>(null);

function isPassingValidationResult(result: FieldValidationResult) {
  return result === true || result === undefined;
}

export function validateFieldValidationControllers(
  controllers: FieldValidationController[]
): FieldValidationResult | Promise<FieldValidationResult> {
  const validateAt = (
    index: number
  ): FieldValidationResult | Promise<FieldValidationResult> => {
    const controller = controllers[index];
    if (!controller) return true;

    const result = controller.validate();
    if (result instanceof Promise) {
      return result.then((resolved) =>
        isPassingValidationResult(resolved)
          ? validateAt(index + 1)
          : resolved
      );
    }

    return isPassingValidationResult(result) ? validateAt(index + 1) : result;
  };

  return validateAt(0);
}

export function useFieldValidationSlot(): FieldValidationSlot {
  const controllersRef = React.useRef(new Set<FieldValidationController>());
  const register = React.useCallback((controller: FieldValidationController) => {
    controllersRef.current.add(controller);
    return () => controllersRef.current.delete(controller);
  }, []);
  const validate = React.useCallback(
    () => validateFieldValidationControllers([...controllersRef.current]),
    []
  );

  return React.useMemo(() => ({ register, validate }), [register, validate]);
}

export function useRegisterFieldValidationController(
  controller: FieldValidationController
) {
  const slot = React.useContext(FieldValidationSlotContext);

  React.useEffect(() => {
    if (!slot) return;
    return slot.register(controller);
  }, [controller, slot]);
}
