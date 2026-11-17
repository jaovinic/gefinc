package com.jvtech.gefinc.admin.deletion;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserNoticeRepository extends JpaRepository<UserNotice, Long> {

  List<UserNotice> findByUserIdAndDeliveredAtIsNullOrderByCreatedAtAsc(long userId);

  Optional<UserNotice> findByIdAndUserId(long id, long userId);
}
