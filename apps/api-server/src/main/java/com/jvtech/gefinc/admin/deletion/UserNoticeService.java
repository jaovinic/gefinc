package com.jvtech.gefinc.admin.deletion;

import com.jvtech.gefinc.auth.AuthDtos.UserNoticeDto;
import com.jvtech.gefinc.common.error.ApiException;
import com.jvtech.gefinc.common.error.ErrorCode;
import com.jvtech.gefinc.user.User;
import com.jvtech.gefinc.user.UserRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Serviço de avisos de entrega única ao usuário (US12, V15). Monta o texto de cancelamento
 * dinamicamente com base no estado resultante da conta (ACTIVE, STILL_BLOCKED ou
 * USER_REQUEST_CONTINUES) e marca a entrega com timestamp (deliveredAt).
 */
@Service
public class UserNoticeService {

  private static final DateTimeFormatter DATE_FORMATTER =
      DateTimeFormatter.ofPattern("dd/MM/yyyy").withZone(ZoneId.of("America/Sao_Paulo"));

  private final UserNoticeRepository noticeRepo;
  private final AccountDeletionRequestRepository deletionRepo;
  private final UserRepository userRepo;
  private final Clock clock;

  public UserNoticeService(
      UserNoticeRepository noticeRepo,
      AccountDeletionRequestRepository deletionRepo,
      UserRepository userRepo,
      Clock clock) {
    this.noticeRepo = noticeRepo;
    this.deletionRepo = deletionRepo;
    this.userRepo = userRepo;
    this.clock = clock;
  }

  @Transactional(propagation = Propagation.REQUIRES_NEW)
  public List<UserNoticeDto> deliverNotices(long userId) {
    User user = userRepo.findById(userId).orElse(null);
    if (user == null) {
      return List.of();
    }
    return deliverNotices(user);
  }

  @Transactional(propagation = Propagation.REQUIRES_NEW)
  public List<UserNoticeDto> deliverNotices(User user) {
    List<UserNotice> pending =
        noticeRepo.findByUserIdAndDeliveredAtIsNullOrderByCreatedAtAsc(user.getId());
    if (pending.isEmpty()) {
      return List.of();
    }

    Instant now = clock.instant();
    List<UserNoticeDto> result = new ArrayList<>(pending.size());

    for (UserNotice notice : pending) {
      AccountDeletionRequest req =
          deletionRepo.findById(notice.getDeletionRequestId()).orElse(null);

      String variant;
      LocalDate originalDeletionDate = null;
      String message;

      if (req != null
          && req.getSupersedesId() != null
          && user.isDeletionPending()
          && AccountDeletionRequest.ORIGIN_USER.equals(user.getDeletionOrigin())) {
        variant = "USER_REQUEST_CONTINUES";
        AccountDeletionRequest originalReq =
            deletionRepo.findById(req.getSupersedesId()).orElse(null);
        Instant due =
            originalReq != null && originalReq.getDueAt() != null
                ? originalReq.getDueAt()
                : user.getDeletionDueAt();
        if (due != null) {
          originalDeletionDate = LocalDate.ofInstant(due, ZoneId.of("America/Sao_Paulo"));
          String dateStr = DATE_FORMATTER.format(due);
          message =
              "A exclusão administrativa desta conta foi cancelada. A sua solicitação de exclusão continua agendada para "
                  + dateStr
                  + ".";
        } else {
          message =
              "A exclusão administrativa desta conta foi cancelada. A sua solicitação de exclusão continua agendada.";
        }
      } else if (user.isSuspended()) {
        variant = "STILL_BLOCKED";
        message =
            "A exclusão administrativa desta conta foi cancelada. Sua conta continua suspensa; entre em contato com o suporte.";
      } else {
        variant = "ACTIVE";
        message = "A exclusão administrativa desta conta foi cancelada. Sua conta segue ativa.";
      }

      notice.markDelivered(now);
      noticeRepo.save(notice);

      result.add(
          new UserNoticeDto(
              notice.getId(), notice.getKind(), variant, originalDeletionDate, message));
    }

    return result;
  }

  @Transactional
  public void dismiss(long userId, long noticeId) {
    UserNotice notice =
        noticeRepo
            .findByIdAndUserId(noticeId, userId)
            .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND, "Aviso não encontrado."));
    if (notice.getDismissedAt() == null) {
      notice.dismiss(clock.instant());
      noticeRepo.save(notice);
    }
  }
}
