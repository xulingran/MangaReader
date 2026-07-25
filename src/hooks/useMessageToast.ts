import { action, useAppSelector, useAppDispatch } from '~/redux';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { Toast } from 'native-base';

const { throwMessage } = action;

export const useMessageToast = () => {
  const dispatch = useAppDispatch();
  const message = useAppSelector((state) => state.app.message);

  useFocusEffect(
    useCallback(() => {
      if (message.length > 0) {
        const timeouts = message.map((text) =>
          setTimeout(() => {
            Toast.show({ title: text, duration: 5000, placement: 'bottom' });
          }, 0)
        );
        dispatch(throwMessage());
        return () => {
          timeouts.forEach((timeout) => clearTimeout(timeout));
        };
      }
    }, [message, dispatch])
  );
};
