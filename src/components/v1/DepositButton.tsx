// src/components/v1/DepositButton.tsx
import React, { CSSProperties } from "react";
import {
  Button,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalBody,
  ModalCloseButton,
  useDisclosure,
  ModalProps,
} from "@chakra-ui/react";

interface DepositButtonProps {
  buttonText: string;
  popupText: string;
  buttonStyle?: CSSProperties;
  modalStyles?: CSSProperties;
}

const DepositButton: React.FC<DepositButtonProps> = ({
  buttonText,
  popupText,
  buttonStyle,
  modalStyles,
}) => {
  const { isOpen, onOpen, onClose } = useDisclosure();

  return (
    <>
      <Button onClick={onOpen} style={buttonStyle}>
        {buttonText}
      </Button>
      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalOverlay />
        <ModalContent style={modalStyles}>
          <ModalBody>
            <p>{popupText}</p>
          </ModalBody>
          <ModalCloseButton />
        </ModalContent>
      </Modal>
    </>
  );
};

export default DepositButton;
